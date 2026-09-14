import { resolvesToPublicHost } from "@crm/db/safe-fetch";

const SECOND_MS = 1_000;

export const COMPANY_RESEARCH = {
	request: {
		timeoutMs: 15 * SECOND_MS,
		retries: 1,
		maxPages: 3,
		maxBytes: 512 * 1024,
	},
} as const;

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

export type LookupResult =
	| { outcome: "found"; brand: Brand; raw: unknown }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

export interface CompanyResearchProvider {
	readonly name: string;
	available(): boolean;
	lookup(domain: string): Promise<LookupResult>;
	read(
		url: string,
	): Promise<
		| { outcome: "found"; text: string; raw: unknown }
		| { outcome: "failed"; reason: string }
	>;
}

type Fetcher = typeof fetch;

export class BrightDataCompanyResearch implements CompanyResearchProvider {
	readonly name = "Bright Data";

	constructor(private readonly fetcher: Fetcher = fetch) {}

	available(): boolean {
		return Boolean(this.unlockerUrl() && this.unlockerToken());
	}

	async lookup(domain: string): Promise<LookupResult> {
		if (!this.available()) {
			return { outcome: "skipped", reason: "Bright Data is not configured." };
		}

		const official = await this.officialUrl(domain);
		if (!official)
			return {
				outcome: "skipped",
				reason: "No public company page matched this domain.",
			};

		const page = await this.read(official);
		if (page.outcome === "failed") {
			return { outcome: "failed", reason: page.reason, retryable: true };
		}

		return {
			outcome: "found",
			brand: brandFromPage(domain, official, page.text),
			raw: {
				provider: "bright-data",
				officialUrl: official,
				pages: [{ url: official, content: page.text }],
			},
		};
	}

	async read(
		url: string,
	): Promise<
		| { outcome: "found"; text: string; raw: unknown }
		| { outcome: "failed"; reason: string }
	> {
		let target: URL;
		try {
			target = new URL(url);
		} catch {
			return { outcome: "failed", reason: "The company page URL is invalid." };
		}
		if (target.protocol !== "https:" && target.protocol !== "http:") {
			return { outcome: "failed", reason: "The company page URL is unsafe." };
		}
		if (
			!(await resolvesToPublicHost(
				target.hostname,
				COMPANY_RESEARCH.request.timeoutMs,
			))
		)
			return {
				outcome: "failed",
				reason: "The company page URL is not public.",
			};

		const endpoint = this.unlockerUrl();
		const token = this.unlockerToken();
		if (!endpoint || !token)
			return { outcome: "failed", reason: "Bright Data is not configured." };

		for (
			let attempt = 0;
			attempt <= COMPANY_RESEARCH.request.retries;
			attempt += 1
		) {
			try {
				const response = await this.fetcher(endpoint, {
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
						accept: "text/html,application/json",
					},
					body: JSON.stringify({
						url: target.toString(),
						zone: "web_unlocker",
						format: "raw",
					}),
					signal: AbortSignal.timeout(COMPANY_RESEARCH.request.timeoutMs),
				});
				if (!response.ok) {
					if (
						response.status >= 400 &&
						response.status < 500 &&
						response.status !== 429
					)
						return {
							outcome: "failed",
							reason: `Bright Data answered ${response.status}.`,
						};
					continue;
				}
				const text = (
					await limitedText(response, COMPANY_RESEARCH.request.maxBytes)
				).trim();
				return {
					outcome: "found",
					text,
					raw: {
						provider: "bright-data",
						url: target.toString(),
						content: text,
					},
				};
			} catch {}
		}
		return { outcome: "failed", reason: "Bright Data did not answer in time." };
	}

	private async officialUrl(domain: string): Promise<string | null> {
		const direct = `https://${domain}`;
		if (
			await resolvesToPublicHost(domain, COMPANY_RESEARCH.request.timeoutMs)
		) {
			return direct;
		}
		const endpoint = process.env.BRIGHT_DATA_SERP_URL?.trim();
		const token = process.env.BRIGHT_DATA_SERP_API_KEY?.trim();
		if (!endpoint || !token) return null;
		try {
			const response = await this.fetcher(endpoint, {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					query: domain,
					num_results: COMPANY_RESEARCH.request.maxPages,
				}),
				signal: AbortSignal.timeout(COMPANY_RESEARCH.request.timeoutMs),
			});
			if (!response.ok) return null;
			const body = (await response.json()) as {
				organic?: { link?: unknown }[];
				results?: { url?: unknown }[];
			};
			const candidates = [
				...(body.organic ?? []).map((row) => row.link),
				...(body.results ?? []).map((row) => row.url),
			];
			for (const candidate of candidates.slice(
				0,
				COMPANY_RESEARCH.request.maxPages,
			)) {
				if (typeof candidate !== "string") continue;
				let page: URL;
				try {
					page = new URL(candidate);
				} catch {
					continue;
				}
				const matches =
					page.hostname === domain || page.hostname.endsWith(`.${domain}`);
				if (
					matches &&
					(await resolvesToPublicHost(
						page.hostname,
						COMPANY_RESEARCH.request.timeoutMs,
					))
				)
					return page.toString();
			}
		} catch {}
		return null;
	}

	private unlockerUrl(): string | null {
		return (
			process.env.BRIGHT_DATA_WEB_UNLOCKER_URL?.trim() ||
			process.env.BRIGHT_DATA_ISP_URL?.trim() ||
			null
		);
	}

	private unlockerToken(): string | null {
		return (
			process.env.BRIGHT_DATA_WEB_UNLOCKER_API_KEY?.trim() ||
			process.env.BRIGHT_DATA_ISP_API_KEY?.trim() ||
			null
		);
	}
}

export const companyResearch: CompanyResearchProvider =
	new BrightDataCompanyResearch();

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

export function brandFromPage(
	domain: string,
	url: string,
	page: string,
): Brand {
	const title =
		content("og:title", page) ??
		/<title[^>]*>([^<]+)<\/title>/i.exec(page)?.[1]?.trim() ??
		null;
	const description =
		content("description", page) ?? content("og:description", page);
	const logo = content("og:image", page);
	const email =
		/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(page)?.[0] ?? null;
	const phone = /\+?[0-9][0-9(). -]{6,}[0-9]/.exec(page)?.[0] ?? null;
	const socialPatterns: [string, RegExp][] = [
		["linkedin", /https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"'\s<]+/i],
		["x", /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^"'\s<]+/i],
		["github", /https?:\/\/(?:www\.)?github\.com\/[^"'\s<]+/i],
	];
	const socials = socialPatterns.flatMap(([type, expression]) => {
		const match = expression.exec(page)?.[0];
		return match ? [{ type, url: match }] : [];
	});
	return {
		domain,
		title,
		description,
		email,
		phone,
		logos: absoluteUrl(logo ?? "", url)
			? [
				{
					url: absoluteUrl(logo ?? "", url),
					type: "logo",
					mode: "light",
				},
			]
			: [],
		socials,
		links: {
			pricing: link(page, "pricing", url),
			careers: link(page, "careers|jobs", url),
		},
	};
}
