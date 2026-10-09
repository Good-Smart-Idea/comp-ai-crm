import { describe, expect, it, mock } from "bun:test";
import {
	BrightDataClient,
	brightDataConfigFromEnv,
} from "../../src/bright-data";

mock.module("@crm/telemetry", () => ({
	bumpCounter: mock(() => Promise.resolve()),
}));

const config = brightDataConfigFromEnv();
const hasAccount = Boolean(process.env.BRIGHTDATA_USER);

const runIf = config ? it : it.skip;

describe("BrightDataClient contract (live)", () => {
	if (!config) {
		console.warn(
			`[bright-data contract test] skipped: BRIGHTDATA_API_TOKEN/BRIGHTDATA_UNLOCKER_ZONE not set` +
				(hasAccount
					? " (BRIGHTDATA_USER is set, but token/zone are not)."
					: "."),
		);
	}

	runIf(
		"connects to Bright Data and returns a typed result (success or auth error)",
		async () => {
			const client = new BrightDataClient(config);
			const result = await client.fetchText({
				url: "https://example.com",
				timeoutMs: 30_000,
			});

			// The contract test succeeds if:
			// - The client never hangs (we got here with a result within 30s)
			// - The result is strongly typed
			// - We can distinguish success from auth/net failures

			if (result.outcome === "ok") {
				// Successful response
				expect(result.data.length).toBeGreaterThan(0);
				expect(result.status).toEqual(200);
			} else {
				// Error response is typed
				expect(["unauthorized", "bad_response"]).toContain(result.error.code);
				expect([true, false]).toContain(result.error.retryable);
			}
		},
		45_000,
	);

	runIf(
		"never hangs on invalid token (returns typed unauthorized within timeout)",
		async () => {
			const client = new BrightDataClient({
				apiToken: "invalid-token-for-contract-test",
				zone: config?.zone ?? "unlocker",
			});
			const result = await client.fetchText({
				url: "https://example.com",
				timeoutMs: 15_000,
			});

			// Must be an error
			expect(result.outcome).toBe("error");
			// Must be typed and non-retryable
			if (result.outcome === "error") {
				expect(["unauthorized", "bad_response"]).toContain(result.error.code);
				expect(result.error.retryable).toBe(false);
			}
		},
		20_000,
	);
});
