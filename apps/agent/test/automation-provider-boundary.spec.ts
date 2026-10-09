import { afterEach, expect, it } from "bun:test";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { callModelGateway, gsiModel } from "../agent/lib/model-gateway";

const beforeBase = process.env.GSI_MODEL_GATEWAY_BASE_URL;
const beforeKey = process.env.GSI_MODEL_GATEWAY_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
	if (beforeBase === undefined) delete process.env.GSI_MODEL_GATEWAY_BASE_URL;
	else process.env.GSI_MODEL_GATEWAY_BASE_URL = beforeBase;
	if (beforeKey === undefined) delete process.env.GSI_MODEL_GATEWAY_API_KEY;
	else process.env.GSI_MODEL_GATEWAY_API_KEY = beforeKey;
	globalThis.fetch = originalFetch;
});

it("refuses a paid environment route before making an automatic SDK call", async () => {
	process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1";
	process.env.GSI_MODEL_GATEWAY_API_KEY = "qa-secret-never-send";
	let calls = 0;
	globalThis.fetch = Object.assign(
		async () => {
			calls += 1;
			return new Response("{}");
		},
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		callModelGateway("model", [{ role: "user", content: "hello" }]),
	).rejects.toThrow("metered provider");
	expect(calls).toBe(0);
});

it("keeps model construction safe while directing automatic generation to a disabled local endpoint", async () => {
	process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1";
	process.env.GSI_MODEL_GATEWAY_API_KEY = "qa-secret-never-send";
	let called = "";
	let authorization = "";
	globalThis.fetch = Object.assign(
		async (url: string | URL | Request, init?: RequestInit) => {
			called = url.toString();
			authorization = new Headers(init?.headers).get("authorization") ?? "";
			return new Response("unavailable", { status: 503 });
		},
		{ preconnect: originalFetch.preconnect },
	);
	const model = gsiModel("model");
	await expect(
		model.doGenerate({
			prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		}),
	).rejects.toThrow();
	expect(called).toBe("http://127.0.0.1:1/v1/chat/completions");
	expect(authorization).not.toContain("qa-secret-never-send");
});

it("routes the approved CRM default through OpenRouter with bounded reasoning and no fallback", async () => {
	process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1";
	process.env.GSI_MODEL_GATEWAY_API_KEY = "qa-secret-never-send";
	let called = "";
	let body = "";
	let vendor = "";
	globalThis.fetch = Object.assign(
		async (url: string | URL | Request, init?: RequestInit) => {
			called = url.toString();
			body = String(init?.body);
			vendor = new Headers(init?.headers).get("X-GSI-Gateway-Vendor") ?? "";
			return Response.json({
				model: DEFAULT_AGENT_MODEL.id,
				choices: [{ message: { content: "ok" } }],
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
	const result = await callModelGateway(DEFAULT_AGENT_MODEL.id, [
		{ role: "user", content: "hello" },
	]);
	expect(result.vendor).toBe("openrouter");
	expect(called).toBe("https://openrouter.ai/api/v1/chat/completions");
	expect(vendor).toBe("openrouter");
	expect(JSON.parse(body)).toMatchObject({
		model: DEFAULT_AGENT_MODEL.id,
		max_tokens: 4096,
		reasoning: { effort: "low" },
		provider: { allow_fallbacks: false },
	});
	expect(body).not.toContain("qa-secret-never-send");
});

it("bounds the actual Eve model request and retains authored tools", async () => {
	process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1";
	process.env.GSI_MODEL_GATEWAY_API_KEY = "qa-secret-never-send";
	let body = "";
	let called = "";
	globalThis.fetch = Object.assign(
		async (url: string | URL | Request, init?: RequestInit) => {
			called = url.toString();
			body = String(init?.body);
			return new Response("unavailable", { status: 503 });
		},
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		gsiModel(DEFAULT_AGENT_MODEL.id).doGenerate({
			prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			maxOutputTokens: 100_000,
			tools: [
				{
					type: "function",
					name: "read_test",
					inputSchema: { type: "object", properties: {} },
				},
			],
		}),
	).rejects.toThrow();
	expect(called).toBe("https://openrouter.ai/api/v1/chat/completions");
	expect(JSON.parse(body)).toMatchObject({
		model: DEFAULT_AGENT_MODEL.id,
		max_tokens: 4096,
		reasoning: { effort: "low" },
		provider: { allow_fallbacks: false },
	});
	expect(JSON.parse(body).tools[0].function.name).toBe("read_test");
	expect(body).not.toContain("qa-secret-never-send");
});

it("keeps the approved model blocked on an unapproved paid provider", async () => {
	process.env.GSI_MODEL_GATEWAY_BASE_URL = "https://api.openai.com/v1";
	let calls = 0;
	globalThis.fetch = Object.assign(
		async () => {
			calls += 1;
			return Response.json({});
		},
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		callModelGateway(DEFAULT_AGENT_MODEL.id, [
			{ role: "user", content: "hello" },
		]),
	).rejects.toThrow("metered provider");
	expect(calls).toBe(0);
});
