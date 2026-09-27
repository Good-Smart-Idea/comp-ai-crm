import { describe, expect, it } from "bun:test";

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
		"Unlocker zone fetches the production Google fallback target",
		async () => {
			const search = new URL("https://www.google.com/search");
			search.searchParams.set("q", "stripe.com");
			const res = await bdRequest(unlockerZone as string, search.toString());
			expect(res.ok).toBe(true);
			const html = await res.text();
			expect(html.length).toBeGreaterThan(0);
			expect(html.toLowerCase()).toContain("<html");
		},
		45_000,
	);
});
