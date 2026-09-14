import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	BRIGHT_DATA_COMPANY_RESEARCH,
	capabilitiesFrom,
	enabled,
	markdownFor,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"PERPLEXITY_API_KEY",
	"BLOB_READ_WRITE_TOKEN",
	"BRIGHT_DATA_WEB_UNLOCKER_URL",
	"BRIGHT_DATA_WEB_UNLOCKER_API_KEY",
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

describe("managed capabilities", () => {
	it("keeps company research unavailable without managed credentials", () => {
		expect(
			capabilitiesFrom().find(
				(capability) => capability.id === BRIGHT_DATA_COMPANY_RESEARCH,
			)?.enabled,
		).toBe(false);
	});

	it("enables Bright Data only when its endpoint and credential exist", () => {
		process.env.BRIGHT_DATA_WEB_UNLOCKER_URL = "https://bright.example/request";
		process.env.BRIGHT_DATA_WEB_UNLOCKER_API_KEY = "test";
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
		process.env.BRIGHT_DATA_WEB_UNLOCKER_URL = "https://bright.example/request";
		process.env.BRIGHT_DATA_WEB_UNLOCKER_API_KEY = "secret";
		const briefing = markdownFor(capabilitiesFrom());
		expect(briefing).toContain("Company research");
		expect(briefing).not.toContain("secret");
	});
});
