import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	BrightDataCompanyResearch,
	brandFromPage,
	COMPANY_RESEARCH,
	limitedText,
} from "../agent/lib/company-research";

const KEYS = [
	"BRIGHT_DATA_WEB_UNLOCKER_URL",
	"BRIGHT_DATA_WEB_UNLOCKER_API_KEY",
	"BRIGHT_DATA_ISP_URL",
	"BRIGHT_DATA_ISP_API_KEY",
] as const;
const saved: Record<string, string | undefined> = {};

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
	it("maps official page evidence into fillable company facts", () => {
		const brand = brandFromPage(
			"acme.example",
			"https://acme.example",
			'<title>Acme</title><meta name="description" content="Official tools"><meta property="og:image" content="/logo.png"><a href="/pricing">Pricing</a><a href="/careers">Careers</a>sales@acme.example +1 555 010 1234 https://linkedin.com/company/acme',
		);
		expect(brand).toMatchObject({
			title: "Acme",
			description: "Official tools",
			email: "sales@acme.example",
		});
		expect(brand.links?.pricing).toBe("https://acme.example/pricing");
		expect(brand.links?.careers).toBe("https://acme.example/careers");
		expect(brand.logos?.[0]?.url).toBe("https://acme.example/logo.png");
		expect(brand.socials?.[0]).toEqual({
			type: "linkedin",
			url: "https://linkedin.com/company/acme",
		});
	});

	it("degrades without credentials", async () => {
		const provider = new BrightDataCompanyResearch();
		expect(provider.available()).toBe(false);
		expect(await provider.lookup("acme.example")).toEqual({
			outcome: "skipped",
			reason: "Bright Data is not configured.",
		});
	});

	it("requires an endpoint and a credential", () => {
		process.env.BRIGHT_DATA_WEB_UNLOCKER_URL = "https://bright.example/request";
		expect(new BrightDataCompanyResearch().available()).toBe(false);
		process.env.BRIGHT_DATA_WEB_UNLOCKER_API_KEY = "secret";
		expect(new BrightDataCompanyResearch().available()).toBe(true);
	});

	it("limits provider output bytes", async () => {
		const response = new Response("abcdefghij");
		expect(await limitedText(response, 4)).toBe("abcd");
		expect(COMPANY_RESEARCH.request.retries).toBeGreaterThan(0);
	});
});
