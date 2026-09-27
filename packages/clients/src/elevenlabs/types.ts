import { z } from "zod";

export const elevenLabsVoiceSchema = z.object({
	voice_id: z.string(),
	name: z.string(),
	category: z.string().optional(),
	description: z.string().nullable().optional(),
	preview_url: z.string().nullable().optional(),
	labels: z.record(z.string(), z.string()).optional(),
});

export const listVoicesResultSchema = z.object({
	voices: z.array(elevenLabsVoiceSchema),
});

export type ElevenLabsVoice = z.infer<typeof elevenLabsVoiceSchema>;
export type ListVoicesResult = z.infer<typeof listVoicesResultSchema>;

export interface TextToSpeechRequest {
	text: string;
	voiceId: string;
	modelId?: string;
	outputFormat?: string;
	voiceSettings?: {
		stability?: number;
		similarityBoost?: number;
		style?: number;
		useSpeakerBoost?: boolean;
	};
}

export interface TextToSpeechResult {
	audio: ArrayBuffer;
	contentType: string;
}

export type ElevenLabsErrorCode =
	| "unauthorized"
	| "not_found"
	| "rate_limited"
	| "invalid_request"
	| "server_error"
	| "network_error"
	| "unknown";

export class ElevenLabsError extends Error {
	readonly code: ElevenLabsErrorCode;
	readonly status?: number;
	readonly body?: string;

	constructor(
		code: ElevenLabsErrorCode,
		message: string,
		opts?: { status?: number; body?: string; cause?: unknown },
	) {
		super(
			message,
			opts?.cause !== undefined ? { cause: opts.cause } : undefined,
		);
		this.name = "ElevenLabsError";
		this.code = code;
		this.status = opts?.status;
		this.body = opts?.body;
	}
}

export type ElevenLabsResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ElevenLabsError };
