import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";

export const MODEL_GATEWAY = {
	localUrl: "http://127.0.0.1:1/v1",
	timeoutMs: 30_000,
	openrouter: {
		model: DEFAULT_AGENT_MODEL.id,
		maxOutputTokens: 4096,
	},
} as const;
