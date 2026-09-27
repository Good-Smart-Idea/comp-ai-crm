import { bdclient } from "@brightdata/sdk";
import { bumpCounter } from "@crm/telemetry";
import { logger, schedules, task } from "@trigger.dev/sdk";
import { z } from "zod";
import { SNAPSHOT_POLLER } from "./snapshot-poller-config";

const SnapshotStatus = z
	.object({
		status: z.string(),
		snapshot_id: z.string(),
		dataset_id: z.string().optional(),
		running_time: z.number().optional(),
	})
	.passthrough();

export type SnapshotPollResult = {
	snapshotId: string;
	finalStatus: string;
	attempts: number;
	elapsedMs: number;
	recordCount?: number;
	sampleRecord?: unknown;
};

export type SnapshotPollDependencies = {
	fetch: typeof fetch;
	sleep: (milliseconds: number) => Promise<void>;
	now: () => number;
	fetchSnapshot: (snapshotId: string, token: string) => Promise<unknown>;
};

const snapshotPollDependencies: SnapshotPollDependencies = {
	fetch,
	sleep: (milliseconds) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds)),
	now: Date.now,
	fetchSnapshot: async (snapshotId, token) => {
		const client = new bdclient({ apiKey: token });
		return client.scrape.snapshot.fetch(snapshotId, { format: "json" });
	},
};

function brightDataApiToken(): string | null {
	const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
	return token || null;
}

const AUTH_SCHEME = "Bearer";

function authHeader(token: string): string {
	return [AUTH_SCHEME, token].join(" ");
}

export async function pollBrightDataSnapshot(
	snapshotId: string,
	dependencies: SnapshotPollDependencies = snapshotPollDependencies,
): Promise<SnapshotPollResult> {
	const token = brightDataApiToken();
	if (!token) {
		throw new Error(
			"BRIGHTDATA_API_TOKEN is not configured; cannot poll Bright Data snapshots.",
		);
	}

	const startedAt = dependencies.now();
	let attempts = 0;
	let lastStatus: z.infer<typeof SnapshotStatus> | null = null;

	while (attempts < SNAPSHOT_POLLER.poll.maxAttempts) {
		attempts += 1;
		void bumpCounter("bright_data_snapshot_poll_attempts");

		const res = await dependencies.fetch(
			`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
			{ headers: { Authorization: authHeader(token) } },
		);

		if (!res.ok) {
			void bumpCounter("bright_data_snapshot_poll_failed");
			throw new Error(
				`Bright Data snapshot progress check failed: HTTP ${res.status}`,
			);
		}

		const parsed = SnapshotStatus.safeParse(await res.json());
		if (!parsed.success) {
			void bumpCounter("bright_data_snapshot_poll_failed");
			throw new Error(
				`Bright Data snapshot progress response did not match expected shape: ${parsed.error.message}`,
			);
		}

		lastStatus = parsed.data;
		logger.log("bright_data_snapshot_poll", {
			snapshotId,
			attempt: attempts,
			status: lastStatus.status,
		});

		if (lastStatus.status !== "running") break;
		await dependencies.sleep(SNAPSHOT_POLLER.poll.intervalMs);
	}

	if (!lastStatus) {
		throw new Error("Bright Data snapshot poll never received a status.");
	}
	if (lastStatus.status === "running") {
		void bumpCounter("bright_data_snapshot_poll_failed");
		throw new Error(
			`Snapshot ${snapshotId} exceeded ${SNAPSHOT_POLLER.poll.maxAttempts} attempts.`,
		);
	}

	const elapsedMs = dependencies.now() - startedAt;

	let recordCount: number | undefined;
	let sampleRecord: unknown;
	if (lastStatus.status === "ready") {
		try {
			const data = await dependencies.fetchSnapshot(snapshotId, token);
			if (Array.isArray(data)) {
				recordCount = data.length;
				sampleRecord = data[0];
			}
		} catch (cause) {
			logger.warn("bright_data_snapshot_fetch_failed", {
				snapshotId,
				error: cause instanceof Error ? cause.message : String(cause),
			});
		}
	}

	void bumpCounter(
		lastStatus.status === "ready"
			? "bright_data_snapshot_poll_ready"
			: "bright_data_snapshot_poll_incomplete",
	);

	logger.log("bright_data_snapshot_poll_result", {
		snapshotId,
		finalStatus: lastStatus.status,
		attempts,
		elapsedMs,
		recordCount,
	});

	return {
		snapshotId,
		finalStatus: lastStatus.status,
		attempts,
		elapsedMs,
		recordCount,
		sampleRecord,
	};
}

export const bdSnapshotPoll = task({
	id: "bd-snapshot-poll",
	maxDuration: 360,
	run: async (payload: { snapshotId: string }) => {
		return await pollBrightDataSnapshot(payload.snapshotId);
	},
});

export type SnapshotHeartbeatDependencies = {
	env: NodeJS.ProcessEnv;
	fetch: typeof fetch;
	poll: (snapshotId: string) => Promise<SnapshotPollResult>;
};

export async function runSnapshotHeartbeat({
	env,
	fetch: fetchImpl,
	poll,
}: SnapshotHeartbeatDependencies): Promise<
	SnapshotPollResult | { skipped: true; reason: string }
> {
	if (env.NODE_ENV === "development") {
		return { skipped: true, reason: "Development schedules are disabled" };
	}
	const token = env.BRIGHTDATA_API_TOKEN?.trim();
	if (!token) {
		logger.warn("bd_snapshot_poll_cron_skipped_not_configured");
		return { skipped: true, reason: "BRIGHTDATA_API_TOKEN not set" };
	}

	const datasetId =
		env.BRIGHTDATA_HEARTBEAT_DATASET_ID ?? SNAPSHOT_POLLER.heartbeat.datasetId;
	const targetUrl =
		env.BRIGHTDATA_HEARTBEAT_URL ?? SNAPSHOT_POLLER.heartbeat.targetUrl;
	const triggerRes = await fetchImpl(
		`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`,
		{
			method: "POST",
			headers: {
				Authorization: authHeader(token),
				"Content-Type": "application/json",
			},
			body: JSON.stringify([{ url: targetUrl }]),
		},
	);

	if (!triggerRes.ok) {
		void bumpCounter("bright_data_snapshot_trigger_failed");
		throw new Error(
			`Bright Data snapshot trigger failed: HTTP ${triggerRes.status}`,
		);
	}

	const { snapshot_id: snapshotId } = z
		.object({ snapshot_id: z.string() })
		.parse(await triggerRes.json());
	logger.log("bd_snapshot_poll_cron_triggered", { snapshotId, datasetId });
	return poll(snapshotId);
}

export const bdSnapshotPollCron = schedules.task({
	id: "bd-snapshot-poll-cron",
	cron: "0 */6 * * *",
	maxDuration: 360,
	run: async () =>
		runSnapshotHeartbeat({
			env: process.env,
			fetch,
			poll: pollBrightDataSnapshot,
		}),
});
