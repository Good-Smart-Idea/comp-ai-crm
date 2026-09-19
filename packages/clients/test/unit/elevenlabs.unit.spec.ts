import { describe, expect, test } from "bun:test";
import {
	ElevenLabsClient,
	ElevenLabsError,
} from "../../src/elevenlabs/index.js";

describe("ElevenLabsClient unit (no network)", () => {
	test("textToSpeech rejects empty text without a network call", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () => {
				throw new Error("fetch should not be called for invalid input");
			},
		});

		const result = await client.textToSpeech({ text: "", voiceId: "v1" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(ElevenLabsError);
			expect(result.error.code).toBe("invalid_request");
		}
	});

	test("textToSpeech rejects missing voiceId without a network call", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () => {
				throw new Error("fetch should not be called for invalid input");
			},
		});

		const result = await client.textToSpeech({ text: "hello", voiceId: "" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_request");
	});

	test("network failure is normalized to a typed network_error, not a throw", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () => {
				throw new TypeError("simulated DNS failure");
			},
		});

		const result = await client.listVoices();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("network_error");
			expect(result.error.message).toContain("simulated DNS failure");
		}
	});

	test("rate limit (429) maps to rate_limited code", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () =>
				new Response("rate limited", {
					status: 429,
					statusText: "Too Many Requests",
				}),
		});

		const result = await client.listVoices();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("rate_limited");
	});

	test("listVoices parses a well-formed JSON response", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						voices: [{ voice_id: "abc123", name: "Test Voice" }],
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		});

		const result = await client.listVoices();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.voices).toHaveLength(1);
			expect(result.data.voices[0]?.voice_id).toBe("abc123");
		}
	});
});
