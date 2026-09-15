import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { type AgentDefinition, defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { selectedModel } from "../../lib/model";
import { gsiModel } from "../../lib/model-gateway";

export default defineAgent({
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
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
	modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
}) as AgentDefinition;
