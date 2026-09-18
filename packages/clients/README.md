# @gsi/clients

Typed API clients shared across GSI apps (comp-ai-crm, control-center, mcp-servers).

## ElevenLabs

```ts
import { ElevenLabsClient } from "@gsi/clients/elevenlabs";

const client = new ElevenLabsClient(); // reads ELEVENLABS_API_KEY from env

const voices = await client.listVoices();
if (voices.ok) {
	console.log(voices.data.voices.map((v) => v.name));
}

const tts = await client.textToSpeech({
	text: "Hello from the boardroom.",
	voiceId: voices.ok ? voices.data.voices[0]!.voice_id : "",
});
if (tts.ok) {
	// tts.data.audio is an ArrayBuffer (mp3 by default)
}
```

Every call returns `{ ok: true, data }` or `{ ok: false, error: ElevenLabsError }` —
no throwing on expected API failures (bad key, rate limit, invalid voice id,
network errors). `ElevenLabsError.code` is one of:
`unauthorized | not_found | rate_limited | invalid_request | server_error | network_error | unknown`.

## Testing

- `bun test test/unit` — no network, runs in CI.
- `bun test test/contract` — hits the live ElevenLabs API; requires
  `ELEVENLABS_API_KEY` in the environment. Skipped automatically (via
  `test.if`) when the key is absent, so it is safe in CI contexts without
  the secret, and exercises the real API when the key is present.
