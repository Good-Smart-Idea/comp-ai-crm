import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	BrightDataCompanyResearch,
	brandFromPage,
	COMPANY_RESEARCH,
	limitedText,
} from "../agent/lib/company-research";

const KEYS = [
	"BRIGHTDATA_API_TOKEN",
	"BRIGHTDATA_UNLOCKER_USER",
	"BRIGHTDATA_UNLOCKER_PASS",
	"BRIGHTDATA_UNLOCKER_ZONE",
	"BRIGHTDATA_SERP_USER",
	"BRIGHTDATA_SERP_PASS",
	"BRIGHTDATA_SERP_ZONE",
] as const;
const saved: Record<string, string | undefined> = {};

function configure() {
	process.env.BRIGHTDATA_API_TOKEN = "test-token";
	process.env.BRIGHTDATA_UNLOCKER_USER = "unlocker-user";
	process.env.BRIGHTDATA_UNLOCKER_PASS = "unlocker-pass";
	process.env.BRIGHTDATA_UNLOCKER_ZONE = "unlocker-zone";
	process.env.BRIGHTDATA_SERP_USER = "serp-user";
	process.env.BRIGHTDATA_SERP_PASS = "serp-pass";
	process.env.BRIGHTDATA_SERP_ZONE = "serp-zone";
}

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("Bright Data company research", () => {
	it("maps declared page evidence into fillable company facts", () => {
		const brand = brandFromPage(
			"acme.example",
			"https://acme.example",
			'<title>Acme</title><meta name="description" content="Official tools"><meta property="og:image" content="/logo.png"><meta name="brand-color" content="#123456"><meta name="industry" content="Software"><meta name="subindustry" content="CRM"><link rel="icon" href="/favicon.png"><a href="/pricing">Pricing</a><a href="/careers">Careers</a>{"addressLocality":"Paris","addressRegion":"IDF","addressCountry":"FR"} sales@acme.example +1 555 010 1234 #abcdef https://linkedin.com/company/acme',
		);
		expect(brand).toMatchObject({
			title: "Acme",
			description: "Official tools",
			email: "sales@acme.example",
		});
		expect(brand.links?.pricing).toBe("https://acme.example/pricing");
		expect(brand.links?.careers).toBe("https://acme.example/careers");
		expect(brand.logos?.[0]?.url).toBe("https://acme.example/logo.png");
		expect(brand.colors?.[0]?.hex).toBe("#123456");
		expect(brand.logos?.[1]?.url).toBe("https://acme.example/favicon.png");
		expect(brand.address).toMatchObject({ city: "Paris", country_code: "FR" });
	});

	it("degrades without credentials", async () => {
		const provider = new BrightDataCompanyResearch();
		expect(provider.available()).toBe(false);
		expect(await provider.lookup("acme.example")).toEqual({
			outcome: "skipped",
			reason: "Bright Data is not configured.",
		});
	});

	it("uses the documented Bearer request contract", async () => {
		configure();
		let request: RequestInit | undefined;
		const provider = new BrightDataCompanyResearch(async (_url, init) => {
			request = init;
			return new Response("<title>Acme</title>");
		});
		const result = await provider.lookup("acme.example");
		expect(result.outcome).toBe("found");
		expect(request?.headers).toMatchObject({
			authorization: "Bearer test-token",
		});
		expect(JSON.parse(String(request?.body))).toEqual({
			zone: "unlocker-zone",
			url: "https://acme.example/",
			format: "raw",
		});
		expect(JSON.stringify(result)).not.toContain("test-token");
	});

	it("uses a full search-engine URL and the configured SERP zone", async () => {
		configure();
		const bodies: unknown[] = [];
		let calls = 0;
		const provider = new BrightDataCompanyResearch(async (_url, init) => {
			bodies.push(JSON.parse(String(init.body)));
			calls += 1;
			if (calls === 1) return new Response("retry", { status: 503 });
			if (calls === 2)
				return new Response(
					JSON.stringify({
						organic: [{ link: "https://www.acme.example/about" }],
					}),
				);
			return new Response("<title>Acme</title>");
		});
		await provider.lookup("acme.example");
		const serp = bodies.find(
			(body) => (body as { zone: string }).zone === "serp-zone",
		) as { url: string };
		expect(serp.url).toContain("https://www.google.com/search?");
		expect(serp.url).toContain("brd_json=1");
	});

	it("falls back to the Unlocker zone when SERP search is exhausted", async () => {
		configure();
		const bodies: { zone: string; url: string }[] = [];
		const provider = new BrightDataCompanyResearch(async (_url, init) => {
			const body = JSON.parse(String(init.body)) as {
				zone: string;
				url: string;
			};
			bodies.push(body);
			const isGoogleSearch = body.url.includes("google.com/search");
			if (body.zone === "serp-zone" && isGoogleSearch)
				return new Response("down", { status: 503 });
			if (body.zone === "unlocker-zone" && isGoogleSearch)
				return new Response(
					'<a href="https://www.acme.example/about">About</a>',
				);
			if (body.url === "https://acme.example/")
				return new Response("not found", { status: 404 });
			return new Response("<title>Acme</title>");
		});
		const result = await provider.lookup("acme.example");
		const serpAttempts = bodies.filter((body) => body.zone === "serp-zone");
		const unlockerSearch = bodies.find(
			(body) => body.zone === "unlocker-zone" && body.url.includes("google"),
		);
		expect(serpAttempts.length).toBe(COMPANY_RESEARCH.search.retries + 1);
		expect(unlockerSearch).toBeDefined();
		expect(result.outcome).toBe("found");
	});

	it("rejects local, mapped IPv6, userinfo, and non-HTTPS targets", async () => {
		configure();
		const provider = new BrightDataCompanyResearch(
			async () => new Response("ok"),
		);
		for (const url of [
			"http://8.8.8.8/",
			"https://user@example.com/",
			"https://[::ffff:127.0.0.1]/",
			"https://[fe80::1]/",
		]) {
			expect(await provider.read(url)).toEqual({
				outcome: "failed",
				reason: "The company page URL is unsafe.",
			});
		}
	});

	it("limits provider output bytes", async () => {
		const response = new Response("abcdefghij");
		expect(await limitedText(response, 4)).toBe("abcd");
		expect(COMPANY_RESEARCH.request.retries).toBeGreaterThan(0);
	});

	it(
		"returns a failed outcome instead of hanging when the fetch stalls",
		async () => {
			configure();
			const provider = new BrightDataCompanyResearch(
				(_url, init) =>
					new Promise<Response>((_resolve, reject) => {
						const signal = init.signal;
						if (!(signal instanceof AbortSignal)) return;
						signal.addEventListener("abort", () =>
							reject(new Error("The request was aborted.")),
						);
					}),
			);
			const started = Date.now();
			const result = await provider.read("https://stripe.com");
			const elapsed = Date.now() - started;
			expect(result).toEqual({
				outcome: "failed",
				reason: "Bright Data did not answer in time.",
			});
			expect(elapsed).toBeLessThan(
				COMPANY_RESEARCH.request.totalTimeoutMs + 2_000,
			);
		},
		COMPANY_RESEARCH.request.totalTimeoutMs + 5_000,
	);
});
