import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

const LOCAL_GATEWAY_URL = "http://127.0.0.1:1/v1";

export function gsiModel(id: string): ReturnType<OpenAIProvider["chat"]> {
	const baseURL =
		process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim() || LOCAL_GATEWAY_URL;
	const apiKey = process.env.GSI_MODEL_GATEWAY_API_KEY?.trim() || "disabled";
	return createOpenAI({ baseURL, apiKey, name: "gsi" }).chat(id);
}
