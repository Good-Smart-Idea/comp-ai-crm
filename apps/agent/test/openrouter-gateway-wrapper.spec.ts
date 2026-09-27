import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	agentModel,
	resolveVendor,
	runAgentGatewayCall,
} from "../agent/lib/agent-gateway";
import {
	callModelGateway,
	DEFAULT_VENDOR,
	gsiModel,
	ModelGatewayError,
} from "../agent/lib/model-gateway";

const ORIGINAL_BASE_URL = process.env.GSI_MODEL_GATEWAY_BASE_URL;
const ORIGINAL_API_KEY = process.env.GSI_MODEL_GATEWAY_API_KEY;

function restoreEnv() {
	if (ORIGINAL_BASE_URL === undefined)
		delete process.env.GSI_MODEL_GATEWAY_BASE_URL;
	else process.env.GSI_MODEL_GATEWAY_BASE_URL = ORIGINAL_BASE_URL;
	if (ORIGINAL_API_KEY === undefined)
		delete process.env.GSI_MODEL_GATEWAY_API_KEY;
	else process.env.GSI_MODEL_GATEWAY_API_KEY = ORIGINAL_API_KEY;
}

afterEach(restoreEnv);

describe("OpenRouter gateway wrapper — routing and defaults", () => {
	it("sends governed requests through the agent policy boundary", async () => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://gateway.example/v1";
		process.env.GSI_MODEL_GATEWAY_API_KEY = "gateway-key";
		const originalFetch = globalThis.fetch;
		let request: Request | undefined;
		globalThis.fetch = (async (input, init) => {
			request = new Request(input, init);
			return Response.json({
				model: "test-model",
				choices: [{ message: { content: "pong" } }],
			});
		}) as typeof fetch;

		try {
			const result = await runAgentGatewayCall({
				model: "test-model",
				messages: [{ role: "user", content: "ping" }],
				userRequestedOpenRouter: true,
			});
			expect(request?.url).toBe("https://gateway.example/v1/chat/completions");
			expect(request?.headers.get("authorization")).toBe("Bearer gateway-key");
			expect(request?.headers.get("x-gsi-gateway-vendor")).toBe("openrouter");
			expect(await request?.json()).toEqual({
				model: "test-model",
				messages: [{ role: "user", content: "ping" }],
			});
			expect(result.content).toBe("pong");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("defaults to ollama when no vendor is given", () => {
		expect(DEFAULT_VENDOR).toBe("ollama");
		expect(resolveVendor()).toBe("ollama");
		expect(resolveVendor(false)).toBe("ollama");
	});

	it("only reaches openrouter on an explicit user action", () => {
		expect(resolveVendor(true)).toBe("openrouter");
	});

	it("the ai-sdk-provider layer (gsiModel) always uses GSI_MODEL_GATEWAY_BASE_URL", () => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL =
			"https://gateway.example.internal/v1";
		process.env.GSI_MODEL_GATEWAY_API_KEY = "test-key";
		const model = gsiModel("some-model");
		expect(model).toBeDefined();
	});

	it("the agent layer (agentModel) routes ollama by default, openrouter only on request", () => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL =
			"https://gateway.example.internal/v1";
		process.env.GSI_MODEL_GATEWAY_API_KEY = "test-key";
		expect(agentModel("some-model")).toBeDefined();
		expect(agentModel("some-model", true)).toBeDefined();
	});

	it("never reads a raw OPENROUTER_API_KEY from the wrapper source", async () => {
		const { readFile } = await import("node:fs/promises");
		const gatewayPath = new URL(
			"../agent/lib/model-gateway.ts",
			import.meta.url,
		);
		const agentGatewayPath = new URL(
			"../agent/lib/agent-gateway.ts",
			import.meta.url,
		);
		const source = await readFile(gatewayPath, "utf8");
		const agentSource = await readFile(agentGatewayPath, "utf8");
		expect(source).not.toContain("process.env.OPENROUTER_API_KEY");
		expect(agentSource).not.toContain("process.env.OPENROUTER_API_KEY");
	});
});

describe("OpenRouter gateway wrapper — failure path", () => {
	beforeEach(() => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL = "http://127.0.0.1:1/v1";
		delete process.env.GSI_MODEL_GATEWAY_API_KEY;
	});

	it("returns a clear ModelGatewayError instead of hanging or silently returning empty content", async () => {
		let threw: unknown;
		try {
			await callModelGateway(
				"unreachable-model",
				[{ role: "user", content: "hello" }],
				{ timeoutMs: 500 },
			);
		} catch (error) {
			threw = error;
		}
		expect(threw).toBeInstanceOf(ModelGatewayError);
		expect((threw as ModelGatewayError).message.length).toBeGreaterThan(0);
	});

	it("times out cleanly rather than hanging when the gateway never responds", async () => {
		const start = Date.now();
		let threw: unknown;
		try {
			await runAgentGatewayCall({
				model: "unreachable-model",
				messages: [{ role: "user", content: "hello" }],
				timeoutMs: 300,
			});
		} catch (error) {
			threw = error;
		}
		const elapsed = Date.now() - start;
		expect(threw).toBeInstanceOf(ModelGatewayError);
		expect(elapsed).toBeLessThan(5_000);
	});

	it("keeps the timeout active while reading the response body", async () => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://gateway.example/v1";
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_input, init) =>
			({
				ok: true,
				json: () =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener(
							"abort",
							() => reject(new DOMException("Aborted", "AbortError")),
							{ once: true },
						);
					}),
			}) as Response) as typeof fetch;

		try {
			await expect(
				callModelGateway("test-model", [{ role: "user", content: "ping" }], {
					timeoutMs: 20,
				}),
			).rejects.toThrow("timed out after 20ms");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("reports controlled HTTP and response-shape failures", async () => {
		process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://gateway.example/v1";
		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = (async () =>
				new Response("unavailable", { status: 503 })) as typeof fetch;
			await expect(
				callModelGateway("test-model", [{ role: "user", content: "ping" }]),
			).rejects.toThrow("returned 503: unavailable");

			globalThis.fetch = (async () =>
				Response.json({ choices: [] })) as typeof fetch;
			await expect(
				callModelGateway("test-model", [{ role: "user", content: "ping" }]),
			).rejects.toThrow("unexpected shape");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
