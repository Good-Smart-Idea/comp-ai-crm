import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	BRIGHT_DATA_COMPANY_RESEARCH,
	BRIGHT_DATA_WEB_RESEARCH,
	capabilitiesFrom,
	enabled,
	markdownFor,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"BLOB_READ_WRITE_TOKEN",
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
	for (const key of KEYS.slice(1)) process.env[key] = "test";
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

describe("managed capabilities", () => {
	it("keeps web research unavailable without a Bright Data SERP zone", () => {
		expect(
			capabilitiesFrom().find(
				(capability) => capability.id === BRIGHT_DATA_WEB_RESEARCH,
			)?.enabled,
		).toBe(false);
	});

	it("enables web research once BRIGHTDATA_API_TOKEN and BRIGHTDATA_SERP_ZONE are set", () => {
		configure();
		expect(
			capabilitiesFrom().find(
				(capability) => capability.id === BRIGHT_DATA_WEB_RESEARCH,
			)?.enabled,
		).toBe(true);
	});

	it("keeps company research unavailable without managed credentials", () => {
		expect(
			capabilitiesFrom().find(
				(capability) => capability.id === BRIGHT_DATA_COMPANY_RESEARCH,
			)?.enabled,
		).toBe(false);
	});

	it("enables Bright Data only when its managed credentials are complete", () => {
		configure();
		expect(
			capabilitiesFrom().find(
				(capability) => capability.id === BRIGHT_DATA_COMPANY_RESEARCH,
			)?.enabled,
		).toBe(true);
	});

	it("does not turn an unrelated variable into a capability", async () => {
		process.env.SOMETHING_ELSE = "x";
		expect(await enabled("SOMETHING_ELSE")).toBe(false);
		delete process.env.SOMETHING_ELSE;
	});

	it("states that an unavailable provider must not be retried", () => {
		expect(unavailable("Bright Data").reason).toContain(
			"retrying will not help",
		);
	});

	it("does not expose managed credentials in the capability briefing", () => {
		configure();
		const briefing = markdownFor(capabilitiesFrom());
		expect(briefing).toContain("Company research");
		expect(briefing).not.toContain("test");
	});
});
