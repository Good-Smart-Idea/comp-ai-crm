/** Typed ElevenLabs API surface used by @gsi/clients. */

export interface ElevenLabsVoice {
	voice_id: string;
	name: string;
	category?: string;
	description?: string | null;
	preview_url?: string | null;
	labels?: Record<string, string>;
}

export interface ListVoicesResult {
	voices: ElevenLabsVoice[];
}

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

/** Discriminated error union — every failure path returns one of these, never throws for expected API errors. */
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
