import "@crm/env/load";

import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { type AgentDefinition, defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";
import { gsiModel } from "./lib/model-gateway";

void logCapabilities();
onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));
void syncVersion();

export default defineAgent({
	model: defineDynamic({
		fallback: gsiModel(DEFAULT_AGENT_MODEL.id),
		events: {
			"step.started": async () => {
				const selected = await selectedModel();
				return {
					model: gsiModel(selected?.model ?? DEFAULT_AGENT_MODEL.id),
					modelContextWindowTokens:
						selected?.modelContextWindowTokens ??
						DEFAULT_AGENT_MODEL.contextWindowTokens,
				};
			},
		},
	}),
	modelContextWindowTokens: 128_000,
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
}) as AgentDefinition;
