import { bumpCounter } from "@crm/telemetry";

/**
 * Configuration required to talk to Bright Data's Request API
 * (https://api.brightdata.com/request), the same endpoint already used in
 * production by apps/agent/agent/lib/company-research.ts.
 */
export type BrightDataConfig = {
	/** Bearer token for api.brightdata.com. */
	apiToken: string;
	/** Zone to route the request through (e.g. an Unlocker or SERP zone). */
	zone: string;
};

export type BrightDataRequestOptions = {
	/** Absolute https:// URL Bright Data should fetch on our behalf. */
	url: string;
	/** Override the configured zone for this call. */
	zone?: string;
	/** "raw" returns the page body as-is; Bright Data also supports "json". */
	format?: "raw" | "json";
	/** Extra headers Bright Data should send when fetching the target URL. */
	headers?: Record<string, string>;
	/** Per-call timeout; defaults to DEFAULT_TIMEOUT_MS. */
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

const METRIC_ATTEMPT = "bright_data_requests_total";
const METRIC_OK = "bright_data_requests_ok";
const METRIC_FAILED = "bright_data_requests_failed";

/**
 * Reads Bright Data credentials from the environment.
 * Returns null (never throws) when the workspace has not configured
 * Bright Data yet — callers should treat that as "not available".
 */
export function brightDataConfigFromEnv(
	zoneEnvVar = "BRIGHTDATA_UNLOCKER_ZONE",
): BrightDataConfig | null {
	const apiToken = process.env.BRIGHTDATA_API_TOKEN?.trim();
	const zone = process.env[zoneEnvVar]?.trim();
	return apiToken && zone ? { apiToken, zone } : null;
}

/**
 * Thin, typed wrapper around Bright Data's Request API, shared across
 * consumers (e.g. Comp AI CRM's company-research use case). Every call is
 * metered through @crm/telemetry counters so usage/cost rollups pick it up,
 * and every failure mode returns a typed BrightDataError instead of
 * throwing or hanging.
 */
export class BrightDataClient {
	private readonly config: BrightDataConfig | null;

	constructor(config?: BrightDataConfig | null) {
		this.config = config ?? brightDataConfigFromEnv();
	}

	available(): boolean {
		return this.config !== null;
	}

	/**
	 * Fetch a URL through Bright Data and return the raw response text.
	 * Never throws: network errors, timeouts, auth failures and rate
	 * limits all come back as a typed BrightDataResult["error"].
	 */
	async fetchText(
		options: BrightDataRequestOptions,
	): Promise<BrightDataResult<string>> {
		void bumpCounter(METRIC_ATTEMPT);

		if (!this.config) {
			void bumpCounter(METRIC_FAILED);
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
					...options.headers,
				},
				body: JSON.stringify({
					zone,
					url: options.url,
					format: options.format ?? "raw",
				}),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (cause) {
			void bumpCounter(METRIC_FAILED);
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
			void bumpCounter(METRIC_FAILED);
			return {
				outcome: "error",
				error: interpretHttpError(response),
			};
		}

		try {
			const data = await response.text();
			void bumpCounter(METRIC_OK);
			return { outcome: "ok", data, status: response.status };
		} catch (cause) {
			void bumpCounter(METRIC_FAILED);
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
