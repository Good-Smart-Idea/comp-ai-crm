import { describe, expect, it } from "bun:test";
import {
	BrightDataClient,
	brightDataConfigFromEnv,
} from "@gsi/clients/bright-data";

const saved: Record<string, string | undefined> = {};

function setup() {
	for (const key of ["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_UNLOCKER_ZONE"]) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
}

function teardown() {
	for (const key of ["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_UNLOCKER_ZONE"]) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
}

describe("Agent app consumes BrightDataClient from @gsi/clients", () => {
	it("reports not_configured when env is missing", async () => {
		setup();
		const client = new BrightDataClient(null);
		const result = await client.fetchText({ url: "https://example.com" });

		expect(result.outcome).toBe("error");
		if (result.outcome === "error") {
			expect(result.error.code).toBe("not_configured");
		}
		teardown();
	});

	it("config is readable from env via brightDataConfigFromEnv()", () => {
		setup();
		expect(brightDataConfigFromEnv()).toBeNull();

		process.env.BRIGHTDATA_API_TOKEN = "t";
		process.env.BRIGHTDATA_UNLOCKER_ZONE = "z";
		const config = brightDataConfigFromEnv();
		expect(config).toEqual({ apiToken: "t", zone: "z" });

		teardown();
	});
});
