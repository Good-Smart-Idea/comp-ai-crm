import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const KEYS = [
	"BRIGHTDATA_API_TOKEN",
	"BRIGHTDATA_SERP_ZONE",
	"BRIGHTDATA_UNLOCKER_ZONE",
] as const;
const saved: Record<string, string | undefined> = {};

function configure() {
	process.env.BRIGHTDATA_API_TOKEN = "test-token";
	process.env.BRIGHTDATA_SERP_ZONE = "serp-zone";
	process.env.BRIGHTDATA_UNLOCKER_ZONE = "unlocker-zone";
}

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	mock.restore();
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
	mock.restore();
});

describe("CTRL-149: per-task Bright Data endpoint routing", () => {
	it("answers from the SERP zone when it returns organic results", async () => {
		configure();
		let capturedZone: string | undefined;
		mock.module("@crm/db/safe-fetch", () => ({
			safeFetch: async (_url: string, init: { body?: string }) => {
				const body = JSON.parse(init.body ?? "{}");
				capturedZone = body.zone;
				return {
					response: {
						ok: true,
						json: async () => ({
							organic: [
								{
									link: "https://stripe.com",
									title: "Stripe",
									description: "Payments",
								},
							],
						}),
					},
				};
			},
		}));

		const { ask } = await import("../agent/lib/web-research");
		const result = await ask("stripe");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.source).toBe("serp");
			expect(result.data.citations).toContain("https://stripe.com");
		}
		expect(capturedZone).toBe("serp-zone");
	});

	it("falls back to the Unlocker zone when SERP returns zero results, and records provenance", async () => {
		configure();
		const calledZones: string[] = [];
		mock.module("@crm/db/safe-fetch", () => ({
			safeFetch: async (_url: string, init: { body?: string }) => {
				const body = JSON.parse(init.body ?? "{}");
				calledZones.push(body.zone);
				if (body.zone === "serp-zone") {
					return {
						response: {
							ok: true,
							json: async () => ({ organic: [] }),
						},
					};
				}
				return {
					response: {
						ok: true,
						text: async () =>
							'<a href="https://acme.example/about">About Acme</a>',
					},
				};
			},
		}));

		const { ask } = await import("../agent/lib/web-research");
		const result = await ask("acme");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.source).toBe("unlocker-fallback");
			expect(result.data.citations).toContain("https://acme.example/about");
		}
		expect(calledZones).toEqual(["serp-zone", "unlocker-zone"]);
	});

	it("falls back to the Unlocker zone when the SERP call throws (timeout)", async () => {
		configure();
		const calledZones: string[] = [];
		mock.module("@crm/db/safe-fetch", () => ({
			safeFetch: async (_url: string, init: { body?: string }) => {
				const body = JSON.parse(init.body ?? "{}");
				calledZones.push(body.zone);
				if (body.zone === "serp-zone") throw new Error("timeout");
				return {
					response: {
						ok: true,
						text: async () =>
							'<a href="https://acme.example/about">About Acme</a>',
					},
				};
			},
		}));

		const { ask } = await import("../agent/lib/web-research");
		const result = await ask("acme");
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.source).toBe("unlocker-fallback");
		expect(calledZones).toEqual(["serp-zone", "unlocker-zone"]);
	});

	it("reports not-configured cleanly when no Bright Data credentials exist", async () => {
		const { ask } = await import("../agent/lib/web-research");
		const result = await ask("anything");
		expect(result.ok).toBe(false);
	});
});

describe("Bright Data web research behavior", () => {
	it("applies domain filters and limits answer evidence", async () => {
		configure();
		let requestUrl = "";
		const { createWebResearch } = await import("../agent/lib/web-research");
		const ask = createWebResearch(async (_url, init) => {
			const request = JSON.parse(init.body ?? "{}");
			requestUrl = request.url;
			return {
				response: Response.json({
					organic: Array.from({ length: 10 }, (_, index) => ({
						link: `https://example.com/${index}`,
						title: `Result ${index}`,
						description: `Evidence ${index}`,
					})),
				}),
				url: new URL("https://api.brightdata.com/request"),
			};
		});

		const result = await ask("Acme funding", { domains: ["example.com"] });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(new URL(requestUrl).searchParams.get("q")).toContain(
			"site:example.com",
		);
		expect(result.data.text.split("\n")).toHaveLength(3);
		expect(result.data.citations).toHaveLength(8);
	});

	it("reports transport failures instead of empty results", async () => {
		configure();
		const { createWebResearch } = await import("../agent/lib/web-research");
		const ask = createWebResearch(async () => null);

		expect(await ask("Acme")).toEqual({
			ok: false,
			reason: "Bright Data did not answer.",
		});
	});

	it("reports HTTP failures instead of empty results", async () => {
		configure();
		const { createWebResearch } = await import("../agent/lib/web-research");
		const ask = createWebResearch(async () => ({
			response: new Response("rate limited", { status: 429 }),
			url: new URL("https://api.brightdata.com/request"),
		}));

		expect(await ask("Acme")).toEqual({
			ok: false,
			reason: "Bright Data returned HTTP 429.",
		});
	});

	it("reports invalid JSON instead of empty results", async () => {
		configure();
		const { createWebResearch } = await import("../agent/lib/web-research");
		const ask = createWebResearch(async () => ({
			response: new Response("not-json"),
			url: new URL("https://api.brightdata.com/request"),
		}));

		expect(await ask("Acme")).toEqual({
			ok: false,
			reason: "Bright Data returned invalid search data.",
		});
	});
});
