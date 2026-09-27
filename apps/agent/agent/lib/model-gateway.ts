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

function gsiModel(
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

interface GatewayCallOptions {
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

async function callModelGateway(
	model: string,
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	options: GatewayCallOptions = {},
): Promise<GatewayChatResult> {
	const vendor = options.vendor ?? DEFAULT_VENDOR;
	const baseURL = gatewayBaseURL();
	const apiKey = gatewayApiKey();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const cancel = () => controller.abort();
	options.signal?.addEventListener("abort", cancel, { once: true });

	try {
		const response = await fetch(
			`${baseURL.replace(/\/+$/, "")}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"X-GSI-Gateway-Vendor": vendor,
				},
				body: JSON.stringify({ model, messages }),
				signal: controller.signal,
			},
		);

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
	} catch (error) {
		if (error instanceof ModelGatewayError) throw error;
		if (error instanceof Error && error.name === "AbortError") {
			throw new ModelGatewayError(
				timedOut
					? `Model gateway call to ${vendor} timed out after ${timeoutMs}ms`
					: `Model gateway call to ${vendor} was cancelled`,
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
		options.signal?.removeEventListener("abort", cancel);
	}
}

export interface AgentGatewayRequest {
	model: string;
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
	userRequestedOpenRouter?: boolean;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export function resolveVendor(
	userRequestedOpenRouter?: boolean,
): GatewayVendor {
	return userRequestedOpenRouter ? "openrouter" : DEFAULT_VENDOR;
}

export async function runAgentGatewayCall(
	request: AgentGatewayRequest,
): Promise<GatewayChatResult> {
	return callModelGateway(request.model, request.messages, {
		vendor: resolveVendor(request.userRequestedOpenRouter),
		timeoutMs: request.timeoutMs,
		signal: request.signal,
	});
}

export function agentModel(
	model: string,
	userRequestedOpenRouter?: boolean,
): ReturnType<OpenAIProvider["chat"]> {
	return gsiModel(model, resolveVendor(userRequestedOpenRouter));
}
