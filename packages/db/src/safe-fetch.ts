import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5_000;

type LookupAddress = { address: string; family: number };

export function isBlockedAddress(ip: string): boolean {
	const groups = ip.includes(":") ? expandIPv6(ip) : null;

	if (groups) {
		const marker = groups[5];
		if (
			groups.slice(0, 5).every((group) => group === 0) &&
			(marker === 0xffff || marker === 0)
		) {
			const high = groups[6] ?? 0;
			return isBlockedIPv4(high >> 8, high & 0xff);
		}

		const first = groups[0] ?? 0;
		return (
			groups.every((group) => group === 0) ||
			(groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) ||
			(first & 0xfe00) === 0xfc00 ||
			(first & 0xffc0) === 0xfe80 ||
			(first & 0xff00) === 0xff00
		);
	}

	if (net.isIPv4(ip)) {
		const [a = 0, b = 0] = ip.split(".").map(Number);
		return isBlockedIPv4(a, b);
	}

	return true;
}

function isBlockedIPv4(a: number, b: number): boolean {
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function expandIPv6(ip: string): number[] | null {
	let text = (ip.split("%")[0] ?? "").toLowerCase();
	const embedded: number[] = [];
	const lastColon = text.lastIndexOf(":");
	const tail = text.slice(lastColon + 1);
	if (tail.includes(".")) {
		if (!net.isIPv4(tail)) return null;
		const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
		embedded.push((a << 8) | b, (c << 8) | d);
		text = text.slice(0, lastColon + 1);
	}

	const [headText = "", runText, extra] = text.split("::");
	if (extra !== undefined) return null;
	const parse = (part: string) =>
		part
			.split(":")
			.filter((group) => group !== "")
			.map((group) =>
				/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
			);
	const head = parse(headText);
	const run = runText === undefined ? [] : parse(runText);
	const missing = 8 - head.length - run.length - embedded.length;
	if (runText !== undefined && missing < 0) return null;
	const fill = runText === undefined ? [] : Array<number>(missing).fill(0);
	const groups = [...head, ...fill, ...run, ...embedded];
	return groups.length === 8 && !groups.some(Number.isNaN) ? groups : null;
}

async function publicAddresses(
	hostname: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<LookupAddress[]> {
	const literal = hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(literal))
		return isBlockedAddress(literal)
			? []
			: [{ address: literal, family: net.isIP(literal) }];

	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;
	try {
		const addresses = await Promise.race([
			dns.lookup(hostname, { all: true }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`${hostname} did not resolve in time`)),
					timeoutMs,
				);
				onAbort = () => {
					clearTimeout(timer);
					reject(new Error("The request was aborted."));
				};
				signal?.addEventListener("abort", onAbort);
			}),
		]);
		return addresses.length > 0 &&
			addresses.every((address) => !isBlockedAddress(address.address))
			? addresses
			: [];
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
		if (onAbort) signal?.removeEventListener("abort", onAbort);
	}
}

export async function resolvesToPublicHost(
	hostname: string,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
	return (await publicAddresses(hostname, timeoutMs)).length > 0;
}

export async function safeFetch(
	url: string,
	{
		method = "GET",
		timeoutMs = DEFAULT_TIMEOUT_MS,
		headers,
		body,
		signal,
	}: {
		method?: "GET" | "HEAD" | "POST";
		timeoutMs?: number;
		headers?: Record<string, string>;
		body?: string;
		signal?: AbortSignal;
	} = {},
): Promise<{ response: Response; url: URL } | null> {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return null;
	}

	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		if (signal?.aborted) return null;
		if (
			(target.protocol !== "https:" && target.protocol !== "http:") ||
			target.username ||
			target.password ||
			(target.port && target.port !== "80" && target.port !== "443")
		)
			return null;
		const addresses = await publicAddresses(target.hostname, timeoutMs, signal);
		const firstAddress = addresses[0];
		if (!firstAddress) return null;
		const response = await pinnedFetch(target, firstAddress, {
			method,
			timeoutMs,
			headers,
			body,
			signal,
		});
		if (!response) return null;
		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location) {
			await response.body?.cancel();
			try {
				target = new URL(location, target);
			} catch {
				return null;
			}
			continue;
		}
		return { response, url: target };
	}
	return null;
}

function pinnedFetch(
	target: URL,
	address: LookupAddress,
	input: {
		method: "GET" | "HEAD" | "POST";
		timeoutMs: number;
		headers?: Record<string, string>;
		body?: string;
		signal?: AbortSignal;
	},
): Promise<Response | null> {
	return new Promise((resolve) => {
		if (input.signal?.aborted) {
			resolve(null);
			return;
		}
		const secure = target.protocol === "https:";
		const request = (secure ? https : http).request(
			{
				hostname: address.address,
				port: Number(target.port || (secure ? 443 : 80)),
				path: `${target.pathname}${target.search}`,
				method: input.method,
				family: address.family,
				servername: secure ? target.hostname : undefined,
				headers: {
					host: target.host,
					"user-agent": "Mozilla/5.0 (compatible; CRM/1.0)",
					...input.headers,
				},
			},
			(response) => {
				const headers = new Headers();
				for (const [name, value] of Object.entries(response.headers)) {
					if (value !== undefined)
						headers.set(name, Array.isArray(value) ? value.join(", ") : value);
				}
				resolve(
					new Response(Readable.toWeb(response) as ReadableStream, {
						status: response.statusCode ?? 502,
						headers,
					}),
				);
			},
		);
		request.setTimeout(input.timeoutMs, () =>
			request.destroy(new Error("Request timed out.")),
		);
		request.once("error", () => resolve(null));
		if (input.signal) {
			const onAbort = () =>
				request.destroy(new Error("The request was aborted."));
			input.signal.addEventListener("abort", onAbort);
			request.once("close", () =>
				input.signal?.removeEventListener("abort", onAbort),
			);
		}
		request.end(input.body);
	});
}
