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
});
