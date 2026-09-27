import { COUNTERS } from "@crm/telemetry/counters";
import { bumpCounter } from "@crm/telemetry/install";

export type BrightDataConfig = {
	apiToken: string;
	zone: string;
};

export type BrightDataRequestOptions = {
	url: string;
	zone?: string;
	format?: "raw" | "json";
	headers?: Record<string, string>;
	timeoutMs?: number;
};

export type BrightDataErrorCode =
	| "not_configured"
	| "unauthorized"
	| "rate_limited"
	| "timeout"
	| "network_error"
	| "bad_response";

export class BrightDataError extends Error {
	readonly code: BrightDataErrorCode;
	readonly retryable: boolean;
	readonly status?: number;

	constructor(
		code: BrightDataErrorCode,
		message: string,
		options: { retryable: boolean; status?: number },
	) {
		super(message);
		this.name = "BrightDataError";
		this.code = code;
		this.retryable = options.retryable;
		this.status = options.status;
	}
}

export type BrightDataResult<T> =
	| { outcome: "ok"; data: T; status: number }
	| { outcome: "error"; error: BrightDataError };

const DEFAULT_TIMEOUT_MS = 20_000;
const REQUEST_URL = "https://api.brightdata.com/request";

export function brightDataConfigFromEnv(
	zoneEnvVar = "BRIGHTDATA_UNLOCKER_ZONE",
): BrightDataConfig | null {
	const apiToken = process.env.BRIGHTDATA_API_TOKEN?.trim();
	const zone = process.env[zoneEnvVar]?.trim();
	return apiToken && zone ? { apiToken, zone } : null;
}

export class BrightDataClient {
	private readonly config: BrightDataConfig | null;

	constructor(config?: BrightDataConfig | null) {
		this.config = config === undefined ? brightDataConfigFromEnv() : config;
	}

	available(): boolean {
		return this.config !== null;
	}

	async fetchText(
		options: BrightDataRequestOptions,
	): Promise<BrightDataResult<string>> {
		void bumpCounter(COUNTERS.brightDataRequests);

		if (!this.config) {
			void bumpCounter(COUNTERS.brightDataFailed);
			return {
				outcome: "error",
				error: new BrightDataError(
					"not_configured",
					"Bright Data is not configured (missing BRIGHTDATA_API_TOKEN or zone).",
					{ retryable: false },
				),
			};
		}

		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const zone = options.zone ?? this.config.zone;

		let response: Response;
		try {
			response = await fetch(REQUEST_URL, {
				method: "POST",
				headers: {
					authorization: `Bearer ${this.config.apiToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					zone,
					url: options.url,
					format: options.format ?? "raw",
					headers: options.headers,
				}),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (cause) {
			void bumpCounter(COUNTERS.brightDataFailed);
			const timedOut = cause instanceof Error && cause.name === "TimeoutError";
			return {
				outcome: "error",
				error: timedOut
					? new BrightDataError(
							"timeout",
							`Bright Data did not answer within ${timeoutMs}ms.`,
							{ retryable: true },
						)
					: new BrightDataError(
							"network_error",
							cause instanceof Error ? cause.message : String(cause),
							{ retryable: true },
						),
			};
		}

		if (!response.ok) {
			void bumpCounter(COUNTERS.brightDataFailed);
			return {
				outcome: "error",
				error: interpretHttpError(response),
			};
		}

		try {
			const data = await response.text();
			void bumpCounter(COUNTERS.brightDataSucceeded);
			return { outcome: "ok", data, status: response.status };
		} catch (cause) {
			void bumpCounter(COUNTERS.brightDataFailed);
			return {
				outcome: "error",
				error: new BrightDataError(
					"bad_response",
					cause instanceof Error ? cause.message : String(cause),
					{ retryable: true, status: response.status },
				),
			};
		}
	}
}

function interpretHttpError(response: Response): BrightDataError {
	if (response.status === 401 || response.status === 403) {
		return new BrightDataError(
			"unauthorized",
			`Bright Data rejected the request (HTTP ${response.status}).`,
			{ retryable: false, status: response.status },
		);
	}
	if (response.status === 429) {
		return new BrightDataError(
			"rate_limited",
			"Bright Data rate-limited this request.",
			{ retryable: true, status: response.status },
		);
	}
	return new BrightDataError(
		"bad_response",
		`Bright Data answered HTTP ${response.status}.`,
		{ retryable: response.status >= 500, status: response.status },
	);
}
