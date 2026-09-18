import { describe, expect, it } from "bun:test";
import { callModelGateway } from "../agent/lib/model-gateway";

/**
 * Contract test — a real call against the live GSI model gateway, no mocks.
 * `GSI_MODEL_GATEWAY_BASE_URL` is injected by Ada into deploy/CI processes
 * (docs/environment.md). Where it is not set — a plain dev checkout — this
 * capability is unavailable and the test says so rather than faking a
 * response, matching `apps/agent/agent/lib/capabilities.ts`.
 */
const baseURL = process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim();

describe.skipIf(!baseURL)(
	"OpenRouter gateway wrapper — live contract test",
	() => {
		it("a real Ollama-default call through the gateway returns the OpenAI chat-completions shape", async () => {
			const result = await callModelGateway(
				process.env.GSI_MODEL_GATEWAY_TEST_MODEL?.trim() ?? "llama3.1",
				[{ role: "user", content: "Reply with the single word: pong" }],
				{ timeoutMs: 20_000 },
			);
			expect(result.vendor).toBe("ollama");
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.raw).toBeDefined();
		});

		it("a real OpenRouter call, only reachable via userRequestedOpenRouter, returns the same shape", async () => {
			const result = await callModelGateway(
				process.env.GSI_MODEL_GATEWAY_TEST_OPENROUTER_MODEL?.trim() ??
					"openai/gpt-4o-mini",
				[{ role: "user", content: "Reply with the single word: pong" }],
				{ vendor: "openrouter", timeoutMs: 20_000 },
			);
			expect(result.vendor).toBe("openrouter");
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.raw).toBeDefined();
		});
	},
);

if (!baseURL) {
	describe("OpenRouter gateway wrapper — live contract test", () => {
		it("is skipped: GSI_MODEL_GATEWAY_BASE_URL is not set in this environment", () => {
			expect(baseURL).toBeUndefined();
		});
	});
}
