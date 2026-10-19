import { afterAll, beforeAll, expect, it } from "bun:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { db } from "@crm/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
	SECURE_SESSION_COOKIE_NAME,
	sessionCookieHeaders,
} from "../src/cookies";

const userId = `sso-cookie-${randomUUID()}`;
const secret = randomBytes(32).toString("hex");
const productionAuth = betterAuth({
	baseURL: "https://crm.example.test",
	secret,
	database: prismaAdapter(db, { provider: "postgresql" }),
	advanced: { cookiePrefix: "crm", useSecureCookies: true },
	plugins: [apiKey({ defaultPrefix: "crm_", requireName: true })],
});

let cookieValue: string;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "SSO cookie QA",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});
	const context = await productionAuth.$context;
	const session = await context.internalAdapter.createSession(userId);
	if (!session) throw new Error("The QA session was not created.");
	cookieValue = `${session.token}.${createHmac("sha256", secret).update(session.token).digest("base64")}`;
});

afterAll(async () => {
	await db.apikey.deleteMany({ where: { referenceId: userId } });
	await db.user.deleteMany({ where: { id: userId } });
});

function browserHeaders(value = cookieValue): Headers {
	return new Headers({
		cookie: sessionCookieHeaders(value, 3600)
			.map((header) => header.split(";")[0])
			.join("; "),
	});
}

it("the gate's browser cookies authenticate against native production Better Auth", async () => {
	const result = await productionAuth.api.getSession({
		headers: browserHeaders(),
	});
	expect(result?.user.id).toBe(userId);
	const headers = sessionCookieHeaders(cookieValue, 3600);
	expect(headers[1].startsWith(`${SECURE_SESSION_COOKIE_NAME}=`)).toBe(true);
	expect(headers[1].endsWith("; Secure")).toBe(true);
	expect(
		headers.every(
			(header) =>
				header.includes("HttpOnly") && header.includes("SameSite=Lax"),
		),
	).toBe(true);
});

it("the same browser session can create and revoke its own native API key", async () => {
	const headers = browserHeaders();
	const created = await productionAuth.api.createApiKey({
		headers,
		body: { name: "Internal SSO cookie QA", expiresIn: 86400 },
	});
	expect(created.key.startsWith("crm_")).toBe(true);
	const row = await db.apikey.findUnique({
		where: { id: created.id },
		select: { referenceId: true },
	});
	expect(row?.referenceId).toBe(userId);
	await productionAuth.api.deleteApiKey({
		headers,
		body: { keyId: created.id },
	});
	expect(
		await db.apikey.findUnique({
			where: { id: created.id },
			select: { id: true },
		}),
	).toBeNull();
});

it("a tampered cookie still fails authentication", async () => {
	const result = await productionAuth.api.getSession({
		headers: browserHeaders(`${cookieValue}tampered`),
	});
	expect(result).toBeNull();
});
