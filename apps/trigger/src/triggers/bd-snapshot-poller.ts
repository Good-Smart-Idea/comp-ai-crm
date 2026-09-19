import { bdclient } from "@brightdata/sdk";
import { bumpCounter } from "@crm/telemetry";
import { logger, schedules, task } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * CTRL-161: Bright Data dataset snapshot poller.
 *
 * Bright Data's Dataset API is async: you trigger a collection job against
 * a dataset and get back a `snapshot_id`, then poll `datasets/v3/progress/:id`
 * until the job is no longer "running". This mirrors the same Bright Data
 * Request API surface already used in production by
 * apps/agent/agent/lib/company-research.ts and apps/agent/agent/lib/bd-client.ts
 * (both talk to api.brightdata.com), but for the dataset/snapshot workflow
 * instead of the synchronous Request API.
 *
 * Two tasks are exported:
 *   - `bdSnapshotPoll`      — polls one snapshot_id to completion and logs/
 *                             returns the result. Callable on demand with
 *                             `tasks.trigger("bd-snapshot-poll", { snapshotId })`.
 *   - `bdSnapshotPollCron`  — scheduled heartbeat: triggers a small, cheap
 *                             snapshot job against a known-good dataset and
 *                             polls it, so we get a periodic live signal that
 *                             the Bright Data dataset pipeline still works.
 */

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 60; // ~5 minutes at 5s intervals

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

function brightDataApiToken(): string | null {
	const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
	return token || null;
}

const AUTH_SCHEME = "Bearer";

function authHeader(token: string): string {
	return [AUTH_SCHEME, token].join(" ");
}

/**
 * Poll a Bright Data dataset snapshot until it's no longer "running",
 * or until MAX_POLL_ATTEMPTS is reached. Uses the same
 * api.brightdata.com host as the rest of the codebase's Bright Data
 * integration, but the dataset-specific v3 progress/snapshot endpoints
 * (not currently wrapped by the @gsi/clients Request-API client or the
 * @brightdata/sdk scrape helpers already used by company-research).
 */
export async function pollBrightDataSnapshot(
	snapshotId: string,
): Promise<SnapshotPollResult> {
	const token = brightDataApiToken();
	if (!token) {
		throw new Error(
			"BRIGHTDATA_API_TOKEN is not configured; cannot poll Bright Data snapshots.",
		);
	}

	const startedAt = Date.now();
	let attempts = 0;
	let lastStatus: z.infer<typeof SnapshotStatus> | null = null;

	while (attempts < MAX_POLL_ATTEMPTS) {
		attempts += 1;
		void bumpCounter("bright_data_snapshot_poll_attempts");

		const res = await fetch(
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
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	if (!lastStatus) {
		throw new Error("Bright Data snapshot poll never received a status.");
	}

	const elapsedMs = Date.now() - startedAt;

	let recordCount: number | undefined;
	let sampleRecord: unknown;
	if (lastStatus.status === "ready") {
		try {
			const client = new bdclient({ apiKey: token });
			const data = await client.scrape.snapshot.fetch(snapshotId, {
				format: "json",
			});
			if (Array.isArray(data)) {
				recordCount = data.length;
				sampleRecord = data[0];
			}
		} catch (cause) {
			// Surfacing the poll status is the contract here; a fetch failure
			// on the (larger) result payload shouldn't fail the whole poll.
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

/**
 * On-demand task: poll a specific Bright Data snapshot to completion.
 * Trigger with: tasks.trigger("bd-snapshot-poll", { snapshotId: "sd_..." })
 */
export const bdSnapshotPoll = task({
	id: "bd-snapshot-poll",
	maxDuration: 360,
	run: async (payload: { snapshotId: string }) => {
		return await pollBrightDataSnapshot(payload.snapshotId);
	},
});

/**
 * Scheduled heartbeat: every 6 hours, trigger a fresh, cheap Bright Data
 * dataset collection job (Crunchbase company lookup for a fixed, stable
 * URL) and poll it end-to-end. This is a live liveness check for the
 * Bright Data dataset pipeline, independent of any one CRM feature.
 *
 * Disabled by default in the dev environment (see trigger.config.ts
 * retries.enabledInDev) to avoid burning Bright Data quota on every
 * `trigger dev` session; the cron fires in deployed (staging/prod)
 * environments only.
 */
export const bdSnapshotPollCron = schedules.task({
	id: "bd-snapshot-poll-cron",
	cron: "0 */6 * * *",
	maxDuration: 360,
	run: async () => {
		const token = brightDataApiToken();
		if (!token) {
			logger.warn("bd_snapshot_poll_cron_skipped_not_configured");
			return { skipped: true, reason: "BRIGHTDATA_API_TOKEN not set" };
		}

		const datasetId =
			process.env.BRIGHTDATA_HEARTBEAT_DATASET_ID ?? "gd_l1vijqt9jfj7olije"; // Crunchbase companies information
		const targetUrl =
			process.env.BRIGHTDATA_HEARTBEAT_URL ??
			"https://www.crunchbase.com/organization/openai";

		const triggerRes = await fetch(
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

		return await pollBrightDataSnapshot(snapshotId);
	},
});
