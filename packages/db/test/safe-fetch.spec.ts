import { describe, expect, it } from "bun:test";
import { safeFetch } from "../src/safe-fetch";

describe("safeFetch cancellation", () => {
	it("returns null for an already aborted signal", async () => {
		const controller = new AbortController();
		controller.abort();

		expect(
			await safeFetch("https://example.com", { signal: controller.signal }),
		).toBeNull();
	});

	it("settles after an active request is aborted", async () => {
		const controller = new AbortController();
		const startedAt = Date.now();
		const pending = safeFetch("http://192.0.2.1", {
			signal: controller.signal,
			timeoutMs: 10_000,
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		controller.abort();

		expect(await pending).toBeNull();
		expect(Date.now() - startedAt).toBeLessThan(1_000);
	});
});
