import { afterEach, describe, expect, it, mock } from "bun:test";
import type { SnapshotPollDependencies } from "../../src/triggers/bd-snapshot-poller";

mock.module("@crm/telemetry", () => ({
	bumpCounter: mock(() => Promise.resolve()),
}));

const savedToken = process.env.BRIGHTDATA_API_TOKEN;

afterEach(() => {
	if (savedToken === undefined) delete process.env.BRIGHTDATA_API_TOKEN;
	else process.env.BRIGHTDATA_API_TOKEN = savedToken;
});

function dependencies(responses: Response[]): SnapshotPollDependencies {
	let now = 0;
	return {
		fetch: mock(
			async () => responses.shift() ?? new Response(null, { status: 500 }),
		) as typeof fetch,
		sleep: mock(async () => {}),
		now: () => (now += 10),
		fetchSnapshot: mock(async () => [{ id: "record" }]),
	};
}

describe("pollBrightDataSnapshot", () => {
	it("throws a clear error when BRIGHTDATA_API_TOKEN is missing", async () => {
		delete process.env.BRIGHTDATA_API_TOKEN;
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		await expect(pollBrightDataSnapshot("sd_fake")).rejects.toThrow(
			/BRIGHTDATA_API_TOKEN is not configured/,
		);
	});

	it("polls running snapshots until ready and fetches results", async () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		const deps = dependencies([
			Response.json({ status: "running", snapshot_id: "sd_1" }),
			Response.json({ status: "ready", snapshot_id: "sd_1" }),
		]);
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await pollBrightDataSnapshot("sd_1", deps);
		expect(result.finalStatus).toBe("ready");
		expect(result.attempts).toBe(2);
		expect(result.recordCount).toBe(1);
		expect(deps.sleep).toHaveBeenCalledTimes(1);
	});

	it("throws on HTTP and malformed responses", async () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		await expect(
			pollBrightDataSnapshot(
				"sd_1",
				dependencies([new Response(null, { status: 503 })]),
			),
		).rejects.toThrow("HTTP 503");
		await expect(
			pollBrightDataSnapshot(
				"sd_1",
				dependencies([Response.json({ status: "ready" })]),
			),
		).rejects.toThrow("expected shape");
	});

	it("returns failed as a terminal state without fetching results", async () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		const deps = dependencies([
			Response.json({ status: "failed", snapshot_id: "sd_1" }),
		]);
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await pollBrightDataSnapshot("sd_1", deps);
		expect(result.finalStatus).toBe("failed");
		expect(deps.fetchSnapshot).not.toHaveBeenCalled();
	});

	it("throws when running snapshots exhaust the attempt limit", async () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		const running = Array.from({ length: 60 }, () =>
			Response.json({ status: "running", snapshot_id: "sd_1" }),
		);
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		await expect(
			pollBrightDataSnapshot("sd_1", dependencies(running)),
		).rejects.toThrow("exceeded 60 attempts");
	});

	it("preserves a ready poll when result retrieval fails", async () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		const deps = dependencies([
			Response.json({ status: "ready", snapshot_id: "sd_1" }),
		]);
		deps.fetchSnapshot = mock(async () => {
			throw new Error("result unavailable");
		});
		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await pollBrightDataSnapshot("sd_1", deps);
		expect(result.finalStatus).toBe("ready");
		expect(result.recordCount).toBeUndefined();
	});
});

describe("runSnapshotHeartbeat", () => {
	it("skips development without making a request", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("unexpected request");
		}) as typeof fetch;
		const poll = mock(async () => {
			throw new Error("unexpected poll");
		});
		const { runSnapshotHeartbeat } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await runSnapshotHeartbeat({
			env: { NODE_ENV: "development" },
			fetch: fetchImpl,
			poll,
		});
		expect(result).toEqual({
			skipped: true,
			reason: "Development schedules are disabled",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(poll).not.toHaveBeenCalled();
	});

	it("skips missing credentials without making a request", async () => {
		const fetchImpl = mock(async () => new Response()) as typeof fetch;
		const poll = mock(async () => {
			throw new Error("unexpected poll");
		});
		const { runSnapshotHeartbeat } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await runSnapshotHeartbeat({
			env: { NODE_ENV: "production" },
			fetch: fetchImpl,
			poll,
		});
		expect(result).toEqual({
			skipped: true,
			reason: "BRIGHTDATA_API_TOKEN not set",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("reports failed trigger responses", async () => {
		const { runSnapshotHeartbeat } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		await expect(
			runSnapshotHeartbeat({
				env: { NODE_ENV: "production", BRIGHTDATA_API_TOKEN: "token" },
				fetch: mock(
					async () => new Response(null, { status: 503 }),
				) as typeof fetch,
				poll: mock(async () => {
					throw new Error("unexpected poll");
				}),
			}),
		).rejects.toThrow("HTTP 503");
	});

	it("triggers and polls a snapshot", async () => {
		const poll = mock(async (snapshotId: string) => ({
			snapshotId,
			finalStatus: "ready",
			attempts: 1,
			elapsedMs: 10,
		}));
		const { runSnapshotHeartbeat } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);
		const result = await runSnapshotHeartbeat({
			env: { NODE_ENV: "production", BRIGHTDATA_API_TOKEN: "token" },
			fetch: mock(async () =>
				Response.json({ snapshot_id: "sd_1" }),
			) as typeof fetch,
			poll,
		});
		expect(result).toMatchObject({ snapshotId: "sd_1", finalStatus: "ready" });
		expect(poll).toHaveBeenCalledWith("sd_1");
	});
});
