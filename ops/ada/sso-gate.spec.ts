import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import http from "node:http";

mock.module("@crm/auth", () => ({ auth: {} }));
mock.module("@crm/db", () => ({ db: {} }));

let upstream: http.Server;
let api: http.Server;
let gate: http.Server;
let gateUrl: string;

function listen(server: http.Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") throw new Error("No port");
			resolve(address.port);
		});
	});
}

function close(server: http.Server): Promise<void> {
	return new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

beforeAll(async () => {
	upstream = http.createServer((request, response) => {
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({ headers: request.headers, url: request.url }),
		);
	});
	api = http.createServer((request, response) => {
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({ headers: request.headers, url: request.url }),
		);
	});
	process.env.GATE_UPSTREAM_HOST = "127.0.0.1";
	process.env.GATE_UPSTREAM_PORT = String(await listen(upstream));
	process.env.GATE_API_HOST = "127.0.0.1";
	process.env.GATE_API_PORT = String(await listen(api));
	const { createSsoGate } = await import("./sso-gate");
	gate = createSsoGate(async (email) =>
		email === "known@example.com"
			? ({
					forbidden: false,
					user: {} as never,
					cookieValue: "token.signature",
				} as const)
			: ({ forbidden: true } as const),
	);
	gateUrl = `http://127.0.0.1:${await listen(gate)}`;
});

afterAll(async () => {
	await Promise.all(
		[gate, upstream, api].filter(Boolean).map((server) => close(server)),
	);
});

describe("SSO gate", () => {
	it("removes identity headers and rewrites authenticated cookies", async () => {
		const response = await fetch(`${gateUrl}/companies`, {
			headers: { "cf-access-authenticated-user-email": " Known@Example.com " },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain(
			"crm.session_token=token.signature",
		);
		const body = (await response.json()) as { headers: Record<string, string> };
		expect(body.headers["cf-access-authenticated-user-email"]).toBeUndefined();
		expect(body.headers.cookie).toContain("crm.session_token=token.signature");
		expect(body.headers.cookie).toContain(
			"__Secure-crm.session_token=token.signature",
		);
	});

	it("rejects unknown users", async () => {
		const response = await fetch(`${gateUrl}/companies`, {
			headers: { "cf-access-authenticated-user-email": "unknown@example.com" },
		});
		expect(response.status).toBe(403);
	});

	it("routes REST requests to the API and preserves session cookies", async () => {
		const response = await fetch(`${gateUrl}/api/rest/companies`, {
			headers: { cookie: "crm.session_token=existing.signature" },
		});
		const body = (await response.json()) as {
			headers: Record<string, string>;
			url: string;
		};
		expect(body.url).toBe("/rest/companies");
		expect(body.headers.cookie).toContain(
			"__Secure-crm.session_token=existing.signature",
		);
	});

	it("creates the Better Auth cookie signature", async () => {
		const { signSessionToken } = await import("./sso-gate");
		const signature = createHmac("sha256", "secret")
			.update("token")
			.digest("base64");
		expect(signSessionToken("token", "secret")).toBe(`token.${signature}`);
	});
});
