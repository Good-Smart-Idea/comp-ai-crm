import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { z } from "zod";

const LOCAL_GATEWAY_URL = "http://127.0.0.1:1/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

export type GatewayVendor = "ollama" | "openrouter";

export const DEFAULT_VENDOR: GatewayVendor = "ollama";

const gatewayChatCompletionSchema = z.object({
	model: z.string().optional(),
	choices: z
		.array(
			z.object({
				message: z.object({
					content: z.string(),
				}),
			}),
		)
		.min(1),
});

export class ModelGatewayError extends Error {
	readonly vendor: GatewayVendor;
	readonly cause2: unknown;

	constructor(message: string, vendor: GatewayVendor, cause?: unknown) {
		super(message);
		this.name = "ModelGatewayError";
		this.vendor = vendor;
		this.cause2 = cause;
	}
}

function gatewayBaseURL(): string {
	return process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim() || LOCAL_GATEWAY_URL;
}

function gatewayApiKey(): string {
	return process.env.GSI_MODEL_GATEWAY_API_KEY?.trim() || "disabled";
}

/**
 * The ai-sdk-provider layer. Every call goes through the governed
 * GSI_MODEL_GATEWAY_BASE_URL gateway. `vendor` defaults to "ollama" and is
 * never inferred — a caller must explicitly pass "openrouter" (an explicit
 * user action) to reach it. There is no path that resolves an OpenRouter
 * call from ambient state.
 */
export function gsiModel(
	id: string,
	vendor: GatewayVendor = DEFAULT_VENDOR,
): ReturnType<OpenAIProvider["chat"]> {
	const baseURL = gatewayBaseURL();
	const apiKey = gatewayApiKey();
	return createOpenAI({
		baseURL,
		apiKey,
		name: `gsi-${vendor}`,
		headers: { "X-GSI-Gateway-Vendor": vendor },
	}).chat(id);
}

export interface GatewayCallOptions {
	vendor?: GatewayVendor;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface GatewayChatResult {
	vendor: GatewayVendor;
	model: string;
	content: string;
	raw: unknown;
}

/**
 * The sdk layer. A minimal, dependency-light OpenAI-compatible client
 * against the governed gateway. Used by the agent and contract tests that
 * need the raw HTTP shape rather than the ai-sdk wrapper.
 *
 * Defaults to "ollama". Only an explicit `vendor: "openrouter"` reaches
 * OpenRouter, and only via the gateway base URL — never a raw
 * OPENROUTER_API_KEY.
 */
export async function callModelGateway(
	model: string,
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	options: GatewayCallOptions = {},
): Promise<GatewayChatResult> {
	const vendor = options.vendor ?? DEFAULT_VENDOR;
	const baseURL = gatewayBaseURL();
	const apiKey = gatewayApiKey();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	if (options.signal) {
		options.signal.addEventListener("abort", () => controller.abort());
	}

	let response: Response;
	try {
		response = await fetch(`${baseURL.replace(/\/+$/, "")}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"X-GSI-Gateway-Vendor": vendor,
			},
			body: JSON.stringify({ model, messages }),
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timer);
		if (error instanceof Error && error.name === "AbortError") {
			throw new ModelGatewayError(
				`Model gateway call to ${vendor} timed out after ${timeoutMs}ms`,
				vendor,
				error,
			);
		}
		throw new ModelGatewayError(
			`Model gateway call to ${vendor} failed to reach ${baseURL}: ${
				error instanceof Error ? error.message : String(error)
			}`,
			vendor,
			error,
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new ModelGatewayError(
			`Model gateway call to ${vendor} returned ${response.status}: ${body.slice(0, 500)}`,
			vendor,
		);
	}

	const json: unknown = await response.json();
	const parsed = gatewayChatCompletionSchema.safeParse(json);
	if (!parsed.success) {
		throw new ModelGatewayError(
			`Model gateway call to ${vendor} returned an unexpected shape (no choices[0].message.content)`,
			vendor,
		);
	}
	const content = parsed.data.choices.at(0)?.message.content;
	if (content === undefined) {
		throw new ModelGatewayError(
			`Model gateway call to ${vendor} returned an unexpected shape (no choices[0].message.content)`,
			vendor,
		);
	}

	return {
		vendor,
		model: parsed.data.model ?? model,
		content,
		raw: json,
	};
}
