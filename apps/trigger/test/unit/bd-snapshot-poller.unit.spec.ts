import { describe, expect, it, mock } from "bun:test";

mock.module("@crm/telemetry", () => ({
	bumpCounter: mock(() => Promise.resolve()),
}));

describe("pollBrightDataSnapshot", () => {
	it("throws a clear error when BRIGHTDATA_API_TOKEN is missing", async () => {
		const saved = process.env.BRIGHTDATA_API_TOKEN;
		delete process.env.BRIGHTDATA_API_TOKEN;

		const { pollBrightDataSnapshot } = await import(
			"../../src/triggers/bd-snapshot-poller"
		);

		await expect(pollBrightDataSnapshot("sd_fake")).rejects.toThrow(
			/BRIGHTDATA_API_TOKEN is not configured/,
		);

		if (saved !== undefined) process.env.BRIGHTDATA_API_TOKEN = saved;
	});
});
