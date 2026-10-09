import {
	callModelGateway,
	DEFAULT_VENDOR,
	type GatewayCallOptions,
	type GatewayChatResult,
	type GatewayVendor,
	gsiModel,
} from "./model-gateway";

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
	const vendor = resolveVendor(request.userRequestedOpenRouter);
	const options: GatewayCallOptions = {
		vendor,
		timeoutMs: request.timeoutMs,
		signal: request.signal,
	};
	return callModelGateway(request.model, request.messages, options);
}

export function agentModel(
	model: string,
	userRequestedOpenRouter?: boolean,
): ReturnType<typeof gsiModel> {
	return gsiModel(model, resolveVendor(userRequestedOpenRouter));
}
