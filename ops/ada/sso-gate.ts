import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import { createSessionForExistingUser } from "@crm/auth";
import { db } from "@crm/db";

export const ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";
const UP_HOST = process.env.GATE_UPSTREAM_HOST ?? "app";
const UP_PORT = Number(process.env.GATE_UPSTREAM_PORT ?? 3000);
const API_HOST = process.env.GATE_API_HOST ?? "api";
const API_PORT = Number(process.env.GATE_API_PORT ?? 3001);
const REST_PATH_RE = /^\/(api\/)?rest\//;
const COOKIE_NAME = "crm.session_token";
const SECURE_COOKIE_NAME = `__Secure-${COOKIE_NAME}`;
const SESSION_DAYS = 7;

function proxy(
	req: IncomingMessage,
	res: ServerResponse,
	extraCookie?: string,
	target?: { host: string; port: number; path: string },
) {
	const headers = { ...req.headers };
	delete headers[ACCESS_EMAIL_HEADER];
	if (extraCookie) {
		headers.cookie = headers.cookie
			? `${headers.cookie}; ${extraCookie}`
			: extraCookie;
	}
	const up = http.request(
		{
			host: target?.host ?? UP_HOST,
			port: target?.port ?? UP_PORT,
			path: target?.path ?? req.url,
			method: req.method,
			headers,
		},
		(ur) => {
			res.writeHead(ur.statusCode ?? 502, ur.headers);
			ur.pipe(res);
		},
	);
	up.on("error", () => {
		if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
		res.end("cfaccess-gate: upstream error");
	});
	req.pipe(up);
}

export async function cfSignIn(emailLower: string) {
	const user = await db.user.findUnique({ where: { email: emailLower } });
	if (!user) return { forbidden: true } as const;
	const { token, secret } = await createSessionForExistingUser(user.id);
	return {
		forbidden: false,
		user,
		cookieValue: signSessionToken(token, secret),
	} as const;
}

export function signSessionToken(token: string, secret: string): string {
	const signature = createHmac("sha256", secret).update(token).digest("base64");
	return `${token}.${signature}`;
}

function restCookies(cookieHeader: string | undefined): string | undefined {
	if (!cookieHeader) return undefined;
	const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	if (!m) return undefined;
	return `${COOKIE_NAME}=${m[1]}; ${SECURE_COOKIE_NAME}=${m[1]}`;
}

function routeRest(
	req: IncomingMessage,
	res: ServerResponse,
	cookies?: string,
) {
	proxy(req, res, cookies, {
		host: API_HOST,
		port: API_PORT,
		path: (req.url ?? "").replace(/^\/api(?=\/rest\/)/, ""),
	});
}

function parseAccessEmailHeader(raw: string | string[] | undefined): string {
	if (typeof raw !== "string") return "";
	const trimmed = raw.trim();
	return trimmed ? trimmed.toLowerCase() : "";
}

type SignInResult = Awaited<ReturnType<typeof cfSignIn>>;

export function createSsoGate(
	signIn: (email: string) => Promise<SignInResult> = cfSignIn,
) {
	return http.createServer(async (req, res) => {
		try {
			const email = parseAccessEmailHeader(req.headers[ACCESS_EMAIL_HEADER]);
			delete req.headers[ACCESS_EMAIL_HEADER];
			if (!email) {
				if (REST_PATH_RE.test(req.url ?? "")) {
					routeRest(req, res, restCookies(req.headers.cookie));
					return;
				}
				proxy(req, res);
				return;
			}
			const r = await signIn(email);
			if (r.forbidden) {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						error: "Forbidden: unknown Cloudflare Access user",
					}),
				);
				return;
			}
			const cookies = `${COOKIE_NAME}=${r.cookieValue}; ${SECURE_COOKIE_NAME}=${r.cookieValue}`;
			if (REST_PATH_RE.test(req.url ?? "")) {
				routeRest(req, res, cookies);
				return;
			}
			const setCookie = `${COOKIE_NAME}=${r.cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
			res.setHeader("Set-Cookie", setCookie);
			proxy(req, res, cookies);
		} catch (e) {
			console.error("cfaccess-gate error", e);
			if (!res.headersSent)
				res.writeHead(500, { "content-type": "text/plain" });
			res.end("cfaccess-gate: internal error");
		}
	});
}

if (import.meta.main) {
	createSsoGate().listen(3000, () =>
		console.log(`cfaccess-gate listening :3000 → ${UP_HOST}:${UP_PORT}`),
	);
}
