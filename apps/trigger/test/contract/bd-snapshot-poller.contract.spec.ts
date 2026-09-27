import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { pollBrightDataSnapshot } from "../../src/triggers/bd-snapshot-poller";

const triggerResponseSchema = z.object({
	snapshot_id: z.string().min(1),
});

const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
const runIf = token ? it : it.skip;

const DATASET_ID = "gd_l1vijqt9jfj7olije"; // Crunchbase companies information
const TARGET_URL = "https://www.crunchbase.com/organization/openai";

if (!token) {
	console.warn(
		"[bd-snapshot-poller contract test] skipped: BRIGHTDATA_API_TOKEN not set.",
	);
}

describe("Bright Data snapshot poller (live contract)", () => {
	runIf(
		"triggers a real dataset snapshot and polls it to a terminal status",
		async () => {
			const triggerRes = await fetch(
				`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&include_errors=true`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify([{ url: TARGET_URL }]),
				},
			);
			expect(triggerRes.ok).toBe(true);

			const { snapshot_id: snapshotId } = triggerResponseSchema.parse(
				await triggerRes.json(),
			);
			expect(snapshotId.length).toBeGreaterThan(0);

			const result = await pollBrightDataSnapshot(snapshotId);

			expect(result.snapshotId).toBe(snapshotId);
			expect(["ready", "failed"]).toContain(result.finalStatus);
			expect(result.attempts).toBeGreaterThan(0);
		},
		180_000,
	);
});
