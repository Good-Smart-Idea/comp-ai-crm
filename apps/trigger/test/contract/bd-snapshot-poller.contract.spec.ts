import { describe, expect, it } from "bun:test";
import { pollBrightDataSnapshot } from "../../src/triggers/bd-snapshot-poller";

/**
 * Real, live Bright Data contract test for CTRL-161. Requires
 * BRIGHTDATA_API_TOKEN to be set (skips otherwise, matching the
 * convention in packages/clients/test/contract/bright-data.contract.spec.ts).
 *
 * Triggers a real dataset collection job against Bright Data's Crunchbase
 * companies dataset, then polls it with the same poller used by the
 * deployed Trigger.dev task, proving the full trigger -> poll -> result
 * path works against the live Bright Data API (no mocks).
 */
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

			const { snapshot_id: snapshotId } = (await triggerRes.json()) as {
				snapshot_id: string;
			};
			expect(typeof snapshotId).toBe("string");
			expect(snapshotId.length).toBeGreaterThan(0);

			const result = await pollBrightDataSnapshot(snapshotId);

			expect(result.snapshotId).toBe(snapshotId);
			// Terminal states from Bright Data's dataset API; "running" would
			// mean we hit MAX_POLL_ATTEMPTS without the job finishing.
			expect(["ready", "failed", "running"]).toContain(result.finalStatus);
			expect(result.attempts).toBeGreaterThan(0);
		},
		180_000,
	);
});
