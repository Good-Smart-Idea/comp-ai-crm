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

	test("listVoices rejects a malformed successful response", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			fetchImpl: async () =>
				new Response(JSON.stringify({ voices: [{ voice_id: 42 }] }), {
					status: 200,
				}),
		});

		const result = await client.listVoices();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toContain("Failed to parse");
	});

	test("keeps the timeout active while reading a successful body", async () => {
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			timeoutMs: 20,
			fetchImpl: (async (_input, init) =>
				({
					ok: true,
					json: () =>
						new Promise((_resolve, reject) => {
							init?.signal?.addEventListener(
								"abort",
								() => reject(new DOMException("Aborted", "AbortError")),
								{ once: true },
							);
						}),
				}) as Response) as typeof fetch,
		});

		const result = await client.listVoices();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("network_error");
			expect(result.error.message).toBe("ElevenLabs request timed out");
		}
	});

	test("textToSpeech sends defaults and returns audio bytes", async () => {
		let request: Request | undefined;
		const client = new ElevenLabsClient({
			apiKey: "unit-test-key",
			baseUrl: "https://elevenlabs.example/v1",
			fetchImpl: async (input, init) => {
				request = new Request(input, init);
				return new Response(new Uint8Array([1, 2]), {
					headers: { "content-type": "audio/mpeg" },
				});
			},
		});

		const result = await client.textToSpeech({
			text: "hello",
			voiceId: "voice/id",
		});
		expect(result.ok).toBe(true);
		expect(request?.url).toContain("voice%2Fid?output_format=mp3_44100_128");
		expect(request?.headers.get("xi-api-key")).toBe("unit-test-key");
		expect(await request?.json()).toEqual({
			text: "hello",
			model_id: "eleven_multilingual_v2",
		});
		if (result.ok) {
			expect(new Uint8Array(result.data.audio)).toEqual(new Uint8Array([1, 2]));
			expect(result.data.contentType).toBe("audio/mpeg");
		}
	});
});
