import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { z } from "zod";

import { MODEL_GATEWAY } from "./model-gateway-config";

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

function gatewaySettings(model: string, vendor: GatewayVendor) {
	const configured =
		process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim() || MODEL_GATEWAY.localUrl;
	const url = new URL(configured);
	const hostname = url.hostname.toLowerCase();
	const approved =
		url.origin === "https://openrouter.ai" &&
		!url.username &&
		!url.password &&
		!url.search &&
		!url.hash &&
		url.pathname.replace(/\/+$/, "") === "/api/v1" &&
		model === MODEL_GATEWAY.openrouter.model;
	const effectiveVendor = approved ? "openrouter" : vendor;
	const blocked =
		!approved &&
		vendor !== "openrouter" &&
		["openrouter.ai", "api.openai.com", "api.anthropic.com"].includes(hostname);
	return {
		blocked,
		vendor: effectiveVendor,
		baseURL: blocked ? MODEL_GATEWAY.localUrl : configured,
		apiKey: blocked
			? "disabled"
			: process.env.GSI_MODEL_GATEWAY_API_KEY?.trim() || "disabled",
	};
}

const gatewayRequestSchema = z
	.object({
		model: z.string(),
		max_tokens: z.number().positive().optional(),
		max_completion_tokens: z.number().positive().optional(),
	})
	.passthrough();

function requestBody(body: string): string {
	const parsed = gatewayRequestSchema.parse(JSON.parse(body));
	if (parsed.model !== MODEL_GATEWAY.openrouter.model) return body;
	const { max_completion_tokens, ...payload } = parsed;
	return JSON.stringify({
		...payload,
		max_tokens: Math.min(
			parsed.max_tokens ??
				max_completion_tokens ??
				MODEL_GATEWAY.openrouter.maxOutputTokens,
			MODEL_GATEWAY.openrouter.maxOutputTokens,
		),
		reasoning: { effort: "low" },
		provider: { allow_fallbacks: false },
	});
}

export function gsiModel(
	id: string,
	vendor: GatewayVendor = DEFAULT_VENDOR,
): ReturnType<OpenAIProvider["chat"]> {
	const settings = gatewaySettings(id, vendor);
	const { baseURL, apiKey } = settings;
	return createOpenAI({
		baseURL,
		apiKey,
		name: `gsi-${settings.vendor}`,
		headers: { "X-GSI-Gateway-Vendor": settings.vendor },
		fetch: (url, init) =>
			fetch(url, {
				...init,
				body:
					settings.vendor === "openrouter" && init?.body
						? requestBody(z.string().parse(init.body))
						: init?.body,
			}),
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

export async function callModelGateway(
	model: string,
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	options: GatewayCallOptions = {},
): Promise<GatewayChatResult> {
	const settings = gatewaySettings(model, options.vendor ?? DEFAULT_VENDOR);
	const { baseURL, apiKey, blocked, vendor } = settings;
	if (blocked)
		throw new ModelGatewayError(
			"A metered provider cannot be an ambient automation route",
			vendor,
		);
	const timeoutMs = options.timeoutMs ?? MODEL_GATEWAY.timeoutMs;

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
			body:
				vendor === "openrouter"
					? requestBody(JSON.stringify({ model, messages }))
					: JSON.stringify({ model, messages }),
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
		throw new ModelGatewayError(
			`Model gateway call to ${vendor} returned ${response.status}`,
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
