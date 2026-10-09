import { afterEach, expect, it } from "bun:test";
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
