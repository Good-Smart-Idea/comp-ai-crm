import { describe, expect, it } from "bun:test";
import { runAgentGatewayCall } from "../agent/lib/agent-gateway";

const baseURL = process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim();

describe.skipIf(!baseURL)(
	"OpenRouter gateway wrapper — live contract test",
	() => {
		it("a real Ollama-default call through the gateway returns the OpenAI chat-completions shape", async () => {
			const result = await runAgentGatewayCall({
				model: process.env.GSI_MODEL_GATEWAY_TEST_MODEL?.trim() ?? "llama3.1",
				messages: [
					{ role: "user", content: "Reply with the single word: pong" },
				],
				timeoutMs: 20_000,
			});
			expect(result.vendor).toBe("ollama");
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.raw).toBeDefined();
		});

		it("a real OpenRouter call through explicit agent policy returns the same shape", async () => {
			const result = await runAgentGatewayCall({
				model:
					process.env.GSI_MODEL_GATEWAY_TEST_OPENROUTER_MODEL?.trim() ??
					"openai/gpt-4o-mini",
				messages: [
					{ role: "user", content: "Reply with the single word: pong" },
				],
				userRequestedOpenRouter: true,
				timeoutMs: 20_000,
			});
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
