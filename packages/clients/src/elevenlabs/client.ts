import {
	ElevenLabsError,
	type ElevenLabsErrorCode,
	type ElevenLabsResult,
	type ListVoicesResult,
	listVoicesResultSchema,
	type TextToSpeechRequest,
	type TextToSpeechResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

interface TextToSpeechApiBody {
	text: string;
	model_id: string;
	voice_settings?: {
		stability?: number;
		similarity_boost?: number;
		style?: number;
		use_speaker_boost?: boolean;
	};
}

export interface ElevenLabsClientOptions {
	apiKey?: string;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

function statusToCode(status: number, body?: string): ElevenLabsErrorCode {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 404) return "not_found";
	if (status === 429) return "rate_limited";
	if (
		status === 400 &&
		body &&
		/invalid_api_key|api_key_id_used_as_api_key|authentication_error/i.test(
			body,
		)
	) {
		return "unauthorized";
	}
	if (status >= 400 && status < 500) return "invalid_request";
	if (status >= 500) return "server_error";
	return "unknown";
}

export class ElevenLabsClient {
	private readonly apiKey: string | undefined;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: ElevenLabsClientOptions = {}) {
		this.apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
		this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.timeoutMs = options.timeoutMs ?? 30_000;
	}

	private async request<T>(
		path: string,
		init: RequestInit,
		read: (response: Response) => Promise<T>,
	): Promise<ElevenLabsResult<T>> {
		if (!this.apiKey) {
			return {
				ok: false,
				error: new ElevenLabsError(
					"unauthorized",
					"ELEVENLABS_API_KEY is not set",
				),
			};
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
				...init,
				signal: controller.signal,
				headers: {
					"xi-api-key": this.apiKey,
					...(init.headers ?? {}),
				},
			});

			if (!res.ok) {
				let body: string | undefined;
				try {
					body = await res.text();
				} catch {
					body = undefined;
				}
				return {
					ok: false,
					error: new ElevenLabsError(
						statusToCode(res.status, body),
						`ElevenLabs API error: ${res.status} ${res.statusText}`,
						{
							status: res.status,
							body,
						},
					),
				};
			}

			return { ok: true, data: await read(res) };
		} catch (err) {
			if (err instanceof ElevenLabsError) {
				return { ok: false, error: err };
			}
			const isAbort = err instanceof Error && err.name === "AbortError";
			return {
				ok: false,
				error: new ElevenLabsError(
					"network_error",
					isAbort
						? "ElevenLabs request timed out"
						: `ElevenLabs network error: ${(err as Error).message}`,
					{
						cause: err,
					},
				),
			};
		} finally {
			clearTimeout(timer);
		}
	}

	/** List available voices for the authenticated account. */
	async listVoices(): Promise<ElevenLabsResult<ListVoicesResult>> {
		return this.request("/voices", { method: "GET" }, async (response) => {
			try {
				return listVoicesResultSchema.parse(await response.json());
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") throw err;
				throw new ElevenLabsError(
					"unknown",
					`Failed to parse voices response: ${(err as Error).message}`,
					{ cause: err },
				);
			}
		});
	}

	/** Generate speech audio for the given text + voice. Returns raw audio bytes. */
	async textToSpeech(
		req: TextToSpeechRequest,
	): Promise<ElevenLabsResult<TextToSpeechResult>> {
		if (!req.text || req.text.length === 0) {
			return {
				ok: false,
				error: new ElevenLabsError("invalid_request", "text must not be empty"),
			};
		}
		if (!req.voiceId) {
			return {
				ok: false,
				error: new ElevenLabsError("invalid_request", "voiceId is required"),
			};
		}

		const outputFormat = req.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
		const requestBody: TextToSpeechApiBody = {
			text: req.text,
			model_id: req.modelId ?? DEFAULT_MODEL_ID,
		};
		if (req.voiceSettings) {
			requestBody.voice_settings = {
				stability: req.voiceSettings.stability,
				similarity_boost: req.voiceSettings.similarityBoost,
				style: req.voiceSettings.style,
				use_speaker_boost: req.voiceSettings.useSpeakerBoost,
			};
		}

		return this.request(
			`/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			},
			async (response) => {
				try {
					const audio = await response.arrayBuffer();
					const contentType =
						response.headers.get("content-type") ?? "audio/mpeg";
					return { audio, contentType };
				} catch (err) {
					if (err instanceof Error && err.name === "AbortError") throw err;
					throw new ElevenLabsError(
						"unknown",
						`Failed to read audio response: ${(err as Error).message}`,
						{ cause: err },
					);
				}
			},
		);
	}
}
