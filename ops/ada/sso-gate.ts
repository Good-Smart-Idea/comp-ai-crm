/**
 * GSI overlay: Cloudflare Access header SSO gate for Comp AI CRM.
 * Runs as the `sso-gate` sidecar in front of the Next app (:8530 → gate :3000 → app :3000).
 * Existing users only (create_unknown_user semantics = FALSE): an Access-claimed email that
 * is not seeded in the DB gets 403; absence of the header proxies through to the normal
 * sign-in page untouched. Never auto-provisions.
 */
import { auth } from "@crm/auth";
import { db } from "@crm/db";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const HEADER = "cf-access-authenticated-user-email";
const UP_HOST = process.env.GATE_UPSTREAM_HOST ?? "app";
const UP_PORT = Number(process.env.GATE_UPSTREAM_PORT ?? 3000);
// REST bridge (app /api/* and raw /rest/*) goes straight to the internal API
// container over the compose network — never via the public Cloudflare-Access
// hostname the app's baked-in proxy would target.
const API_HOST = process.env.GATE_API_HOST ?? "api";
const API_PORT = Number(process.env.GATE_API_PORT ?? 3001);
const REST_PATH_RE = /^\/(api\/)?rest\//;
const COOKIE_NAME = "crm.session_token";
// API runs NODE_ENV=production → better-auth useSecureCookies prefixes its
// session cookie with __Secure-. Browser gets the plain name (works over the
// local http gate); gate injects both names into the proxied Cookie header.
const SECURE_COOKIE_NAME = `__Secure-${COOKIE_NAME}`;
const SESSION_DAYS = 7;

function proxy(
	req: IncomingMessage,
	res: ServerResponse,
	extraCookie?: string,
	target?: { host: string; port: number; path: string },
) {
	const headers = { ...req.headers };
	delete headers[HEADER]; // never forward Access headers (spoof safety, mirrors BrightBean PR #410)
	if (extraCookie) {
		headers.cookie = headers.cookie ? `${headers.cookie}; ${extraCookie}` : extraCookie;
	}
	const up = http.request(
		{ host: target?.host ?? UP_HOST, port: target?.port ?? UP_PORT, path: target?.path ?? req.url, method: req.method, headers },
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

async function cfSignIn(emailLower: string) {
	const user = await db.user.findUnique({ where: { email: emailLower } });
	if (!user) return { forbidden: true } as const;
	const ctx = await (auth as any).$context;
	let token: string;
	try {
		const session = await ctx.internalAdapter.createSession(user.id);
		token = session.token;
	} catch {
		// fallback: create the better-auth session row directly (same shape as prisma adapter)
		token = randomBytes(32).toString("hex");
		await db.session.create({
			data: {
				id: token,
				token,
				userId: user.id,
				expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
				ipAddress: null,
				userAgent: "cfaccess-gate",
			},
		});
	}
	const secret: string = ctx.options.secret;
	// better-auth ≥1.6 (better-call getSignedCookie) verifies a standard padded
	// base64 HMAC-SHA-256 signature (44 chars, "="-terminated) over the raw token.
	const sig = createHmac("sha256", secret).update(token).digest("base64");
	return { forbidden: false, user, cookieValue: `${token}.${sig}` } as const;
}

function restCookies(cookieHeader: string | undefined): string | undefined {
	if (!cookieHeader) return undefined;
	const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	if (!m) return undefined;
	return `${COOKIE_NAME}=${m[1]}; ${SECURE_COOKIE_NAME}=${m[1]}`;
}

function routeRest(req: IncomingMessage, res: ServerResponse, cookies?: string) {
	proxy(req, res, cookies, {
		host: API_HOST,
		port: API_PORT,
		path: (req.url ?? "").replace(/^\/api(?=\/rest\/)/, ""),
	});
}

const server = http.createServer(async (req, res) => {
	try {
		const raw = req.headers[HEADER];
		const email = typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "";
		delete (req.headers as any)[HEADER];
		if (!email) {
			if (REST_PATH_RE.test(req.url ?? "")) {
				// No Access header but an existing session cookie: still route the REST
				// bridge to the API (it validates the signed token itself; bad token → 401).
				routeRest(req, res, restCookies(req.headers.cookie));
				return;
			}
			proxy(req, res); // no header → normal (local) sign-in path, untouched
			return;
		}
		const r = await cfSignIn(email);
		if (r.forbidden) {
			res.writeHead(403, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: "Forbidden: unknown Cloudflare Access user" }));
			return;
		}
		const cookies = `${COOKIE_NAME}=${r.cookieValue}; ${SECURE_COOKIE_NAME}=${r.cookieValue}`;
		if (REST_PATH_RE.test(req.url ?? "")) {
			// REST bridge: /rest/* direct to the API, /api/rest/* with the app-facing
			// prefix stripped (public ingress strips /api before the API; internal service does not)
			routeRest(req, res, cookies);
			return;
		}
		const setCookie = `${COOKIE_NAME}=${r.cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
		res.setHeader("Set-Cookie", setCookie);
		proxy(req, res, cookies);
	} catch (e) {
		console.error("cfaccess-gate error", e);
		if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
		res.end("cfaccess-gate: internal error");
	}
});

server.listen(3000, () => console.log(`cfaccess-gate listening :3000 → ${UP_HOST}:${UP_PORT}`));
