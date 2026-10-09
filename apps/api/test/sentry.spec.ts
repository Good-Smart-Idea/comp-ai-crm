import { describe, expect, it } from "bun:test";
import { initSentry } from "../src/sentry";

describe("initSentry", () => {
	it("stays disabled without SENTRY_DSN", () => {
		expect(initSentry({})).toBe(false);
	});

	it("enables reporting when SENTRY_DSN is set", () => {
		expect(initSentry({ SENTRY_DSN: "https://public@sentry.invalid/1" })).toBe(
			true,
		);
	});
});
