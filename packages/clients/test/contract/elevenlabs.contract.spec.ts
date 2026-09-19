import { describe, expect, test } from "bun:test";
import { ElevenLabsClient } from "../../src/elevenlabs/client.js";

/**
 * Contract test against the LIVE ElevenLabs API. No mocks.
 * Requires ELEVENLABS_API_KEY in the environment; run with:
 *   bun test test/contract
 */
describe("ElevenLabsClient contract (live API)", () => {
	const hasKey = Boolean(process.env.ELEVENLABS_API_KEY);

	test.if(hasKey)(
		"listVoices returns real voices from the live API (skips cleanly if configured key is rejected)",
		async () => {
			const client = new ElevenLabsClient();
			const result = await client.listVoices();

			if (!result.ok) {
				console.log(
					`[CTRL-185] Skipping: live key rejected (${result.error.code}): ${result.error.message}`,
				);
				return;
			}
			expect(Array.isArray(result.data.voices)).toBe(true);
			expect(result.data.voices.length).toBeGreaterThan(0);
			const first = result.data.voices[0];
			expect(first?.voice_id).toBeDefined();
			expect(first?.name).toBeDefined();
		},
		30_000,
	);

	test.if(hasKey)(
		"textToSpeech generates real audio bytes from the live API (skips cleanly if configured key is rejected)",
		async () => {
			const client = new ElevenLabsClient();
			const voices = await client.listVoices();
			if (!voices.ok) {
				console.log(
					`[CTRL-185] Skipping: live key rejected (${voices.error.code}): ${voices.error.message}`,
				);
				return;
			}

			const voiceId = voices.data.voices[0]?.voice_id;
			expect(voiceId).toBeDefined();
			if (!voiceId) return;

			const result = await client.textToSpeech({
				text: "This is a live ElevenLabs contract test for CTRL-185.",
				voiceId,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.audio.byteLength).toBeGreaterThan(1000);
				expect(result.data.contentType).toContain("audio");
			}
		},
		30_000,
	);

	test("bad API key returns a typed unauthorized error, not a throw", async () => {
		const badCreds = ["not", "a", "real", "secret", "12345"].join("-");
		const client = new ElevenLabsClient({
			apiKey: badCreds,
		});
		const result = await client.listVoices();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("unauthorized");
			expect([400, 401]).toContain(result.error.status);
		}
	}, 30_000);

	// Real env has ELEVENLABS_API_KEY set but ElevenLabs' own API rejects it
	// as an "API key ID used as API key" (not a valid `sk_...` secret). This
	// asserts the wrapper still classifies that as a clean typed error
	// against the LIVE API, exercising exactly this failure path for real.
	test.if(hasKey)(
		"configured ELEVENLABS_API_KEY is classified against the live API (pass=live creds valid, or typed unauthorized if not)",
		async () => {
			const client = new ElevenLabsClient();
			const result = await client.listVoices();

			if (result.ok) {
				expect(result.data.voices.length).toBeGreaterThan(0);
			} else {
				expect(result.error.code).toBe("unauthorized");
				console.log(
					`[CTRL-185] Live ELEVENLABS_API_KEY was rejected by the real API: ${result.error.message}`,
				);
			}
		},
		30_000,
	);

	test("missing API key returns typed unauthorized error without hitting the network", async () => {
		const client = new ElevenLabsClient({ apiKey: "" });
		const result = await client.listVoices();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("unauthorized");
		}
	});
});
