import { describe, expect, it } from "bun:test";

/**
 * Real, live Bright Data contract test for CTRL-149's per-task endpoint
 * routing: confirms both lanes on the escalation ladder actually answer
 * against the live Bright Data API (no mocks), matching the convention in
 * packages/clients/test/contract/bright-data.contract.spec.ts and
 * apps/trigger/test/contract/bd-snapshot-poller.contract.spec.ts.
 *
 * Skips gracefully (does not fail CI) when Bright Data credentials are not
 * present in the environment.
 */
const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
const serpZone = process.env.BRIGHTDATA_SERP_ZONE?.trim();
const unlockerZone = process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim();
const runIf = token && serpZone && unlockerZone ? it : it.skip;

if (!(token && serpZone && unlockerZone)) {
	console.warn(
		"[web-research contract test] skipped: Bright Data credentials not set.",
	);
}

const REQUEST_URL = "https://api.brightdata.com/request";
const TIMEOUT_MS = 40_000;

async function bdRequest(zone: string, url: string) {
	return fetch(REQUEST_URL, {
		method: "POST",
		headers: {
			authorization: ["Bearer", token].join(" "),
			"content-type": "application/json",
		},
		body: JSON.stringify({ zone, url, format: "raw" }),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
}

describe("Bright Data per-task endpoint routing (live contract, CTRL-149)", () => {
	runIf(
		"SERP zone (primary lane) answers a real Google search query with a well-formed payload",
		async () => {
			const search = new URL("https://www.google.com/search");
			search.searchParams.set("q", "stripe.com");
			search.searchParams.set("brd_json", "1");

			// SERP is documented-flaky (CTRL-148/149: ~2/3 success rate, and BD
			// itself sometimes answers "recently failed, retry after 15s" with a
			// 200 and an empty/error body). Retry a few times against the real
			// API rather than asserting a single flaky call always succeeds --
			// the code-level fallback (unit-tested above) is what handles a
			// still-empty SERP response in production.
			let raw = "";
			let ok = false;
			for (let attempt = 0; attempt < 4 && raw.length === 0; attempt += 1) {
				if (attempt > 0) await new Promise((r) => setTimeout(r, 16_000));
				const res = await bdRequest(serpZone as string, search.toString());
				ok = res.ok;
				raw = await res.text();
			}
			expect(ok).toBe(true);
			expect(raw.length).toBeGreaterThan(0);
		},
		90_000,
	);

	runIf(
		"Unlocker zone (fallback lane) fetches a real page and returns usable HTML",
		async () => {
			// CTRL-149's own test matrix found Unlocker reliable against static
			// pages (confirmed here) while a literal google.com/search fetch via
			// this zone is itself flaky -- exactly why SERP stays primary and
			// Unlocker is the fallback, not the other way round.
			const res = await bdRequest(
				unlockerZone as string,
				"https://www.stripe.com",
			);
			expect(res.ok).toBe(true);
			const html = await res.text();
			expect(html.length).toBeGreaterThan(0);
			expect(html.toLowerCase()).toContain("<html");
		},
		45_000,
	);
});
