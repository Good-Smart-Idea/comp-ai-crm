import { safeFetch } from "@crm/db/safe-fetch";
import { z } from "zod";
import { type LinkedInCompanyRecord, linkedInCompanyByUrl } from "./bd-client";

const SECOND_MS = 1_000;

export const COMPANY_RESEARCH = {
	request: {
		timeoutMs: 15 * SECOND_MS,
		retries: 1,
		maxPages: 3,
		maxBytes: 512 * 1024,
		maxConcurrent: 4,
		totalTimeoutMs: 30 * SECOND_MS,
	},
	search: {
		retries: 2,
		fallbackZone: true,
	},
} as const;

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";
const SEARCH_ENGINE_URL = "https://www.google.com/search";

export type Brand = {
	domain?: string | null;
	title?: string | null;
	description?: string | null;
	slogan?: string | null;
	email?: string | null;
	phone?: string | null;
	colors?: { hex?: string | null; name?: string | null }[] | null;
	logos?:
		| {
				url?: string | null;
				mode?: string | null;
				type?: string | null;
				colors?: { hex?: string | null; name?: string | null }[] | null;
		  }[]
		| null;
	socials?: { type?: string | null; url?: string | null }[] | null;
	address?: {
		city?: string | null;
		state_code?: string | null;
		country?: string | null;
		country_code?: string | null;
	} | null;
	industries?: {
		eic?: { industry?: string | null; subindustry?: string | null }[] | null;
	} | null;
	links?: { pricing?: string | null; careers?: string | null } | null;
};

export type ResearchBrief = {
	sourceUrl: string;
	title: string | null;
	description: string | null;
	headings: string[];
	contacts: { email: string | null; phone: string | null };
};

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

export type LookupResult =
	| { outcome: "found"; brand: Brand; raw: JsonObject }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

export type PageResult =
	| {
			outcome: "found";
			brief: ResearchBrief;
			document: string;
			raw: JsonObject;
	  }
	| { outcome: "failed"; reason: string };

export interface CompanyResearchProvider {
	readonly name: string;
	available(): boolean;
	lookup(domain: string): Promise<LookupResult>;
	read(url: string): Promise<PageResult>;
	findProfile(clues: {
		firstName: string | null;
		lastName: string | null;
		companyName: string | null;
		companyDomain: string | null;
	}): Promise<string | null>;
}

const searchResponse = z
	.object({
		organic: z
			.array(z.object({ link: z.string().optional() }).passthrough())
			.optional(),
		results: z
			.array(z.object({ url: z.string().optional() }).passthrough())
			.optional(),
	})
	.passthrough();

type BrightDataRequestInit = Omit<RequestInit, "body" | "method"> & {
	method: "POST";
	body: string;
};

type Fetcher = (url: string, init: BrightDataRequestInit) => Promise<Response>;
type BrightDataConfig = {
	token: string;
	unlockerZone: string;
	serpZone: string;
};

let active = 0;
const waiting: (() => void)[] = [];

async function withPermit<T>(run: () => Promise<T>): Promise<T> {
	if (active >= COMPANY_RESEARCH.request.maxConcurrent)
		await new Promise<void>((resolve) => waiting.push(resolve));
	active += 1;
	try {
		return await run();
	} finally {
		active -= 1;
		waiting.shift()?.();
	}
}

function authorizationHeader(token: string): string {
	return ["Bearer", token].join(" ");
}

function extractSearchResultLinks(document: string): string[] {
	const links: string[] = [];
	for (const match of document.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
		const href = match[1];
		if (href && !links.includes(href)) links.push(href);
	}
	return links;
}

async function secureFetch(
	url: string,
	init: BrightDataRequestInit,
): Promise<Response> {
	const result = await safeFetch(url, {
		method: "POST",
		timeoutMs: COMPANY_RESEARCH.request.timeoutMs,
		headers: Object.fromEntries(new Headers(init.headers).entries()),
		body: init.body,
		signal: init.signal instanceof AbortSignal ? init.signal : undefined,
	});
	if (!result) throw new Error("Bright Data did not answer in time.");
	return result.response;
}

export class BrightDataCompanyResearch implements CompanyResearchProvider {
	readonly name = "Bright Data";

	constructor(private readonly fetcher: Fetcher = secureFetch) {}

	available(): boolean {
		return this.config() !== null;
	}

	async lookup(domain: string): Promise<LookupResult> {
		const config = this.config();
		if (!config)
			return { outcome: "skipped", reason: "Bright Data is not configured." };
		const direct = `https://${domain}`;
		const page = await this.readWithZone(direct, config.unlockerZone, config);
		if (page.outcome === "found") return this.brandResult(domain, direct, page);
		const discovered = await this.discoverOfficialUrl(domain, config);
		if (!discovered)
			return { outcome: "failed", reason: page.reason, retryable: true };
		const discoveredPage = await this.readWithZone(
			discovered,
			config.unlockerZone,
			config,
		);
		return discoveredPage.outcome === "found"
			? this.brandResult(domain, discovered, discoveredPage)
			: { outcome: "failed", reason: discoveredPage.reason, retryable: true };
	}

	async read(url: string): Promise<PageResult> {
		const config = this.config();
		if (!config)
			return { outcome: "failed", reason: "Bright Data is not configured." };
		return this.readWithZone(url, config.unlockerZone, config);
	}

	async findProfile(clues: {
		firstName: string | null;
		lastName: string | null;
		companyName: string | null;
		companyDomain: string | null;
	}): Promise<string | null> {
		const config = this.config();
		const name = [clues.firstName, clues.lastName].filter(Boolean).join(" ");
		if (!config || !name) return null;
		const terms = [
			"site:linkedin.com/in",
			name,
			clues.companyName ?? clues.companyDomain ?? "",
		]
			.filter(Boolean)
			.join(" ");
		return this.search(
			terms,
			config,
			(url) =>
				url.hostname === "linkedin.com" ||
				url.hostname.endsWith(".linkedin.com"),
		);
	}

	private async brandResult(
		domain: string,
		sourceUrl: string,
		page: Extract<PageResult, { outcome: "found" }>,
	): Promise<LookupResult> {
		const brand = brandFromPage(domain, sourceUrl, page.document);
		const linkedinUrl = brand.socials?.find(
			(social) => social.type === "linkedin",
		)?.url;
		const managed = linkedinUrl
			? await linkedInCompanyByUrl(linkedinUrl)
			: null;
		const merged = managed ? mergeManagedCompany(brand, managed) : brand;
		const raw: JsonObject = {
			provider: "bright-data",
			sourceUrl,
			brief: page.brief,
		};
		if (managed) raw.managedCompany = true;
		return {
			outcome: "found",
			brand: merged,
			raw,
		};
	}

	private async readWithZone(
		url: string,
		zone: string,
		config: BrightDataConfig,
	): Promise<PageResult> {
		const target = safeTarget(url);
		if (!target)
			return { outcome: "failed", reason: "The company page URL is unsafe." };
		const deadline = Date.now() + COMPANY_RESEARCH.request.totalTimeoutMs;
		return withPermit(async () => {
			for (
				let attempt = 0;
				attempt <= COMPANY_RESEARCH.request.retries;
				attempt += 1
			) {
				if (Date.now() >= deadline) break;
				try {
					const response = await this.fetcher(BRIGHT_DATA_REQUEST_URL, {
						method: "POST",
						headers: {
							authorization: authorizationHeader(config.token),
							"content-type": "application/json",
							accept: "text/html",
						},
						body: JSON.stringify({
							zone,
							url: target.toString(),
							format: "raw",
						}),
						signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
					});
					if (!response.ok)
						return {
							outcome: "failed",
							reason: `Bright Data answered ${response.status}.`,
						};
					const document = (
						await limitedText(response, COMPANY_RESEARCH.request.maxBytes)
					).trim();
					return {
						outcome: "found",
						document,
						brief: briefFromPage(target.toString(), document),
						raw: { provider: "bright-data", sourceUrl: target.toString() },
					};
				} catch {}
			}
			return {
				outcome: "failed",
				reason: "Bright Data did not answer in time.",
			};
		});
	}

	private async discoverOfficialUrl(
		domain: string,
		config: BrightDataConfig,
	): Promise<string | null> {
		return this.search(
			`site:${domain}`,
			config,
			(url) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
		);
	}

	private async search(
		terms: string,
		config: BrightDataConfig,
		accepts: (url: URL) => boolean,
	): Promise<string | null> {
		for (
			let attempt = 0;
			attempt <= COMPANY_RESEARCH.search.retries;
			attempt += 1
		) {
			const found = await this.searchOnce(terms, config, accepts);
			if (found !== null) return found;
		}
		if (!COMPANY_RESEARCH.search.fallbackZone) return null;
		return this.searchViaUnlockerFallback(terms, config, accepts);
	}

	private async searchOnce(
		terms: string,
		config: BrightDataConfig,
		accepts: (url: URL) => boolean,
	): Promise<string | null> {
		const search = new URL(SEARCH_ENGINE_URL);
		search.searchParams.set("q", terms);
		search.searchParams.set("brd_json", "1");
		const result = await withPermit(async () => {
			try {
				return await this.fetcher(BRIGHT_DATA_REQUEST_URL, {
					method: "POST",
					headers: {
						authorization: authorizationHeader(config.token),
						"content-type": "application/json",
						accept: "application/json",
					},
					body: JSON.stringify({
						zone: config.serpZone,
						url: search.toString(),
						format: "raw",
					}),
					signal: AbortSignal.timeout(COMPANY_RESEARCH.request.timeoutMs),
				});
			} catch {
				return null;
			}
		});
		if (!result?.ok) return null;
		const body = await result.json().catch(() => null);
		for (const candidate of searchCandidates(body).slice(
			0,
			COMPANY_RESEARCH.request.maxPages,
		)) {
			const page = safeTarget(candidate);
			if (page && accepts(page)) return page.toString();
		}
		return null;
	}

	private async searchViaUnlockerFallback(
		terms: string,
		config: BrightDataConfig,
		accepts: (url: URL) => boolean,
	): Promise<string | null> {
		const search = new URL(SEARCH_ENGINE_URL);
		search.searchParams.set("q", terms);
		const result = await withPermit(async () => {
			try {
				return await this.fetcher(BRIGHT_DATA_REQUEST_URL, {
					method: "POST",
					headers: {
						authorization: authorizationHeader(config.token),
						"content-type": "application/json",
						accept: "text/html",
					},
					body: JSON.stringify({
						zone: config.unlockerZone,
						url: search.toString(),
						format: "raw",
					}),
					signal: AbortSignal.timeout(COMPANY_RESEARCH.request.timeoutMs),
				});
			} catch {
				return null;
			}
		});
		if (!result?.ok) return null;
		const document = await limitedText(
			result,
			COMPANY_RESEARCH.request.maxBytes,
		);
		for (const link of extractSearchResultLinks(document)) {
			const page = safeTarget(link);
			if (page && accepts(page)) return page.toString();
		}
		return null;
	}

	private config(): BrightDataConfig | null {
		const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
		const unlockerZone = process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim();
		const serpZone = process.env.BRIGHTDATA_SERP_ZONE?.trim();
		const unlockerUser = process.env.BRIGHTDATA_UNLOCKER_USER?.trim();
		const unlockerPass = process.env.BRIGHTDATA_UNLOCKER_PASS?.trim();
		const serpUser = process.env.BRIGHTDATA_SERP_USER?.trim();
		const serpPass = process.env.BRIGHTDATA_SERP_PASS?.trim();
		return token &&
			unlockerZone &&
			serpZone &&
			unlockerUser &&
			unlockerPass &&
			serpUser &&
			serpPass
			? { token, unlockerZone, serpZone }
			: null;
	}
}

export const companyResearch: CompanyResearchProvider =
	new BrightDataCompanyResearch();

function safeTarget(value: string): URL | null {
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.port ||
			isBlockedHost(host)
		)
			return null;
		return url;
	} catch {
		return null;
	}
}

function isBlockedHost(host: string): boolean {
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "::1" || host.startsWith("fe80:")) return true;
	if (host.startsWith("::ffff:7f") || host.startsWith("::ffff:127."))
		return true;
	const parts = host.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
		return false;
	const first = parts[0] ?? -1;
	const second = parts[1] ?? -1;
	return (
		first === 10 ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	);
}

function searchCandidates(value: JsonValue): string[] {
	const parsed = searchResponse.safeParse(value);
	if (!parsed.success) return [];
	return [
		...(parsed.data.organic ?? []).flatMap((row) => row.link ?? []),
		...(parsed.data.results ?? []).flatMap((row) => row.url ?? []),
	];
}

export async function limitedText(
	response: Response,
	maxBytes: number,
): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (size < maxBytes) {
			const next = await reader.read();
			if (next.done) break;
			const chunk = next.value.slice(0, maxBytes - size);
			chunks.push(chunk);
			size += chunk.byteLength;
		}
	} finally {
		await reader.cancel();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function content(meta: string, page: string): string | null {
	const match = new RegExp(
		`<meta[^>]+(?:name|property)=["']${meta}["'][^>]+content=["']([^"']+)["']`,
		"i",
	).exec(page);
	return match?.[1]?.trim() || null;
}

function absoluteUrl(value: string, base: string): string | null {
	try {
		const url = new URL(value, base);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function link(page: string, label: string, base: string): string | null {
	const match = new RegExp(
		`<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*${label}`,
		"i",
	).exec(page);
	return match?.[1] ? absoluteUrl(match[1], base) : null;
}

function declaredBrandColors(page: string): { hex: string }[] {
	return [content("brand:color", page), content("brand-color", page)].flatMap(
		(value) =>
			value && /^#[0-9a-f]{6}$/i.test(value)
				? [{ hex: value.toUpperCase() }]
				: [],
	);
}

export function briefFromPage(sourceUrl: string, page: string): ResearchBrief {
	const headings = [...page.matchAll(/<h[1-3][^>]*>([^<]{1,160})<\/h[1-3]>/gi)]
		.map((match) => match[1]?.replace(/\s+/g, " ").trim())
		.filter((heading): heading is string => Boolean(heading))
		.slice(0, 8);
	return {
		sourceUrl,
		title:
			content("og:title", page) ??
			/<title[^>]*>([^<]+)<\/title>/i.exec(page)?.[1]?.trim() ??
			null,
		description:
			content("description", page) ?? content("og:description", page),
		headings,
		contacts: {
			email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(page)?.[0] ?? null,
			phone: /\+?[0-9][0-9(). -]{6,}[0-9]/.exec(page)?.[0] ?? null,
		},
	};
}

function mergeManagedCompany(
	brand: Brand,
	managed: LinkedInCompanyRecord,
): Brand {
	const name = managed.name ?? null;
	const website = managed.website ?? null;
	const industries = managed.industries ?? null;
	return {
		...brand,
		title: brand.title ?? name,
		description: brand.description,
		links: brand.links ?? { pricing: website, careers: null },
		industries:
			brand.industries ??
			(industries
				? { eic: [{ industry: industries, subindustry: null }] }
				: null),
	};
}

export function brandFromPage(
	domain: string,
	url: string,
	page: string,
): Brand {
	const brief = briefFromPage(url, page);
	const logo = content("og:image", page);
	const icon =
		/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)/i.exec(
			page,
		)?.[1];
	const city = /["']addressLocality["']\s*[:=]\s*["']([^"']+)/i.exec(page)?.[1];
	const stateCode = /["']addressRegion["']\s*[:=]\s*["']([^"']+)/i.exec(
		page,
	)?.[1];
	const country = /["']addressCountry["']\s*[:=]\s*["']([^"']+)/i.exec(
		page,
	)?.[1];
	const industry =
		content("industry", page) ?? content("article:section", page);
	const subindustry = content("subindustry", page);
	const socialPatterns: [string, RegExp][] = [
		["linkedin", /https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"'\s<]+/i],
		["x", /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^"'\s<]+/i],
		["github", /https?:\/\/(?:www\.)?github\.com\/[^"'\s<]+/i],
	];
	return {
		domain,
		title: brief.title,
		description: brief.description,
		email: brief.contacts.email,
		phone: brief.contacts.phone,
		colors: declaredBrandColors(page),
		logos: [
			...(absoluteUrl(logo ?? "", url)
				? [{ url: absoluteUrl(logo ?? "", url), type: "logo", mode: "light" }]
				: []),
			...(absoluteUrl(icon ?? "", url)
				? [{ url: absoluteUrl(icon ?? "", url), type: "icon", mode: "light" }]
				: []),
		],
		socials: socialPatterns.flatMap(([type, expression]) => {
			const match = expression.exec(page)?.[0];
			return match ? [{ type, url: match }] : [];
		}),
		address:
			city || stateCode || country
				? {
						city,
						state_code: stateCode,
						country,
						country_code: country?.length === 2 ? country.toUpperCase() : null,
					}
				: null,
		industries: industry ? { eic: [{ industry, subindustry }] } : null,
		links: {
			pricing: link(page, "pricing", url),
			careers: link(page, "careers|jobs", url),
		},
	};
}
