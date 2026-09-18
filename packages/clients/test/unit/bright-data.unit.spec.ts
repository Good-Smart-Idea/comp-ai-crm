import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	BrightDataClient,
	BrightDataError,
	brightDataConfigFromEnv,
} from "../../src/bright-data";

const KEYS = ["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_UNLOCKER_ZONE"] as const;
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

describe("brightDataConfigFromEnv", () => {
	it("returns null when the token or zone is missing", () => {
		expect(brightDataConfigFromEnv()).toBeNull();
	});

	it("returns a config once both are set", () => {
		process.env.BRIGHTDATA_API_TOKEN = "token";
		process.env.BRIGHTDATA_UNLOCKER_ZONE = "zone";
		expect(brightDataConfigFromEnv()).toEqual({
			apiToken: "token",
			zone: "zone",
		});
	});
});

describe("BrightDataClient", () => {
	it("reports not_configured without throwing when unset", async () => {
		const client = new BrightDataClient(null);
		const result = await client.fetchText({ url: "https://example.com" });

		expect(result.outcome).toBe("error");
		if (result.outcome === "error") {
			expect(result.error).toBeInstanceOf(BrightDataError);
			expect(result.error.code).toBe("not_configured");
			expect(result.error.retryable).toBe(false);
		}
	});

	it("returns ok with the response body on success", async () => {
		const client = new BrightDataClient({ apiToken: "t", zone: "z" });
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async () =>
			new Response("<html>hi</html>", { status: 200 }),
		) as typeof fetch;

		try {
			const result = await client.fetchText({ url: "https://example.com" });
			expect(result).toEqual({
				outcome: "ok",
				data: "<html>hi</html>",
				status: 200,
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("maps a 401 to a typed, non-retryable unauthorized error", async () => {
		const client = new BrightDataClient({ apiToken: "bad", zone: "z" });
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async () =>
			new Response("nope", { status: 401 }),
		) as typeof fetch;

		try {
			const result = await client.fetchText({ url: "https://example.com" });
			expect(result.outcome).toBe("error");
			if (result.outcome === "error") {
				expect(result.error.code).toBe("unauthorized");
				expect(result.error.retryable).toBe(false);
				expect(result.error.status).toBe(401);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("maps a 429 to a retryable rate_limited error", async () => {
		const client = new BrightDataClient({ apiToken: "t", zone: "z" });
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async () =>
			new Response("slow down", { status: 429 }),
		) as typeof fetch;

		try {
			const result = await client.fetchText({ url: "https://example.com" });
			expect(result.outcome).toBe("error");
			if (result.outcome === "error") {
				expect(result.error.code).toBe("rate_limited");
				expect(result.error.retryable).toBe(true);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("never hangs: aborts and returns a typed timeout error", async () => {
		const client = new BrightDataClient({ apiToken: "t", zone: "z" });
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					const signal = init?.signal;
					if (signal) {
						signal.addEventListener("abort", () => {
							reject(new DOMException("aborted", "TimeoutError"));
						});
					}
				}),
		) as typeof fetch;

		try {
			const result = await client.fetchText({
				url: "https://example.com",
				timeoutMs: 25,
			});
			expect(result.outcome).toBe("error");
			if (result.outcome === "error") {
				expect(result.error.code).toBe("timeout");
				expect(result.error.retryable).toBe(true);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("maps a network failure to a retryable network_error", async () => {
		const client = new BrightDataClient({ apiToken: "t", zone: "z" });
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async () => {
			throw new Error("getaddrinfo ENOTFOUND");
		}) as typeof fetch;

		try {
			const result = await client.fetchText({ url: "https://example.com" });
			expect(result.outcome).toBe("error");
			if (result.outcome === "error") {
				expect(result.error.code).toBe("network_error");
				expect(result.error.retryable).toBe(true);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
