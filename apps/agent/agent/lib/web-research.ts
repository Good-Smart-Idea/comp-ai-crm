import { safeFetch } from "@crm/db/safe-fetch";
import { z } from "zod";

// Open-web research via GSI's Bright Data escalation ladder — never Perplexity,
// never BD_CLAUDE_PROXY (that proxy is reserved for Claude/Anthropic egress only).
// Rung 1: Bright Data SERP zone for a search, reading organic result snippets.
// Rung 2 (CTRL-149): when SERP times out or answers with zero organic results,
// fall back to an Unlocker-fetched Google results page and scrape links out of
// the raw HTML instead of surfacing a bare error to the CRM record. Escalation
// to residential/unlocker zones for reading individual pages also lives in
// company-research.ts (readWithZone) and is reused here where a citation needs
// its page body rather than just a search snippet.

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";
const SEARCH_ENGINE_URL = "https://www.google.com/search";
const TIMEOUT_MS = 20_000;

export type AnswerSource = "serp" | "unlocker-fallback";

export type Answer = {
	text: string;
	citations: string[];
	/** Which Bright Data lane actually produced this answer (CTRL-149 provenance). */
	source: AnswerSource;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AskOptions = {
	domains?: string[];
};

type BrightDataConfig = {
	token: string;
	serpZone: string;
	unlockerZone?: string;
};

function config(): BrightDataConfig | null {
	const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
	const serpZone = process.env.BRIGHTDATA_SERP_ZONE?.trim();
	const unlockerZone = process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim();
	return token && serpZone ? { token, serpZone, unlockerZone } : null;
}

export function webResearchEnabled(): boolean {
	return config() !== null;
}

type OrganicResult = {
	link?: string;
	title?: string;
	description?: string;
};

type SearchOutcome =
	| { ok: true; results: OrganicResult[] }
	| { ok: false; reason: string };

type WebResearchFetcher = typeof safeFetch;

const searchResponse = z.object({
	organic: z
		.array(
			z.object({
				link: z.string().optional(),
				title: z.string().optional(),
				description: z.string().optional(),
			}),
		)
		.optional(),
});

function authHeader(token: string): string {
	return ["Bearer", token].join(" ");
}

async function serpSearch(
	terms: string,
	cfg: BrightDataConfig,
	fetcher: WebResearchFetcher,
): Promise<SearchOutcome> {
	const search = new URL(SEARCH_ENGINE_URL);
	search.searchParams.set("q", terms);
	search.searchParams.set("brd_json", "1");

	let result: Awaited<ReturnType<WebResearchFetcher>>;
	try {
		result = await fetcher(BRIGHT_DATA_REQUEST_URL, {
			method: "POST",
			timeoutMs: TIMEOUT_MS,
			headers: {
				authorization: authHeader(cfg.token),
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({
				zone: cfg.serpZone,
				url: search.toString(),
				format: "raw",
			}),
		});
	} catch {
		return { ok: false, reason: "Bright Data did not answer." };
	}

	if (!result) return { ok: false, reason: "Bright Data did not answer." };
	if (!result.response.ok)
		return {
			ok: false,
			reason: `Bright Data returned HTTP ${result.response.status}.`,
		};
	try {
		const body = searchResponse.parse(await result.response.json());
		return { ok: true, results: body.organic ?? [] };
	} catch {
		return {
			ok: false,
			reason: "Bright Data returned invalid search data.",
		};
	}
}

/**
 * Rung 2 fallback (CTRL-149): fetch the raw Google results page through the
 * Unlocker zone (which auto-bypasses CF/captcha) and scrape organic result
 * links + surrounding text out of the HTML. Used only when the SERP zone
 * times out or returns zero organic results, so a flaky SERP endpoint never
 * surfaces a bare error to the CRM record.
 */
async function unlockerFallbackSearch(
	terms: string,
	cfg: BrightDataConfig,
	fetcher: WebResearchFetcher,
): Promise<SearchOutcome> {
	if (!cfg.unlockerZone) return { ok: true, results: [] };

	const search = new URL(SEARCH_ENGINE_URL);
	search.searchParams.set("q", terms);

	let result: Awaited<ReturnType<WebResearchFetcher>>;
	try {
		result = await fetcher(BRIGHT_DATA_REQUEST_URL, {
			method: "POST",
			timeoutMs: TIMEOUT_MS,
			headers: {
				authorization: authHeader(cfg.token),
				"content-type": "application/json",
				accept: "text/html",
			},
			body: JSON.stringify({
				zone: cfg.unlockerZone,
				url: search.toString(),
				format: "raw",
			}),
		});
	} catch {
		return { ok: false, reason: "Bright Data did not answer." };
	}

	if (!result) return { ok: false, reason: "Bright Data did not answer." };
	if (!result.response.ok)
		return {
			ok: false,
			reason: `Bright Data returned HTTP ${result.response.status}.`,
		};
	try {
		return {
			ok: true,
			results: extractOrganicFromHtml(await result.response.text()),
		};
	} catch {
		return {
			ok: false,
			reason: "Bright Data returned unreadable search data.",
		};
	}
}

function extractOrganicFromHtml(document: string): OrganicResult[] {
	const results: OrganicResult[] = [];
	const seen = new Set<string>();
	for (const match of document.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
		const link = match[1];
		if (!link || seen.has(link)) continue;
		if (link.includes("google.com/") || link.includes("gstatic.com")) continue;
		seen.add(link);
		results.push({ link });
		if (results.length >= 8) break;
	}
	return results;
}

/**
 * Answers a research question using Bright Data's SERP zone as the primary
 * lane, with an automatic Unlocker-fetched-search-page fallback (CTRL-149)
 * when SERP times out or comes back empty. Returns organic-result snippets
 * as the answer text plus the result URLs as citations, and records which
 * lane (`source`) actually answered so a human reviewing a record can see
 * exactly which BD lane produced each field. No LLM synthesis, no
 * Perplexity call.
 */
async function askWith(
	fetcher: WebResearchFetcher,
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const cfg = config();
	if (!cfg) return { ok: false, reason: "Bright Data is not configured." };

	const domainFilter =
		options.domains && options.domains.length > 0
			? ` (${options.domains.map((domain) => `site:${domain}`).join(" OR ")})`
			: "";
	const terms = `${question}${domainFilter}`;

	try {
		const primary = await serpSearch(terms, cfg, fetcher);
		let organic = primary.ok ? primary.results : [];
		let source: AnswerSource = "serp";

		if (organic.length === 0) {
			const fallback = await unlockerFallbackSearch(terms, cfg, fetcher);
			if (!fallback.ok) return fallback;
			if (fallback.results.length === 0 && !primary.ok) return primary;
			organic = fallback.results;
			source = "unlocker-fallback";
		}

		const citations = organic
			.flatMap((row) => (row.link ? [row.link] : []))
			.slice(0, 8);
		if (citations.length === 0)
			return { ok: false, reason: "Bright Data returned no results." };

		const text = organic
			.slice(0, 3)
			.map((row) => [row.title, row.description].filter(Boolean).join(" — "))
			.filter((line) => line.length > 0)
			.join("\n");
		const fallbackText =
			text || (source === "unlocker-fallback" ? citations.join("\n") : "");
		if (!fallbackText) return { ok: false, reason: "Empty answer." };

		return { ok: true, data: { text: fallbackText, citations, source } };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

export function createWebResearch(fetcher: WebResearchFetcher) {
	return (question: string, options: AskOptions = {}) =>
		askWith(fetcher, question, options);
}

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	return askWith(safeFetch, question, options);
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	const slugs: string[] = [];

	for (const term of terms) {
		const answer = await ask(`site:linkedin.com/in "${term}" ${companyName}`, {
			domains: ["linkedin.com"],
		});

		if (!answer.ok) continue;

		const haystack = [answer.data.text, ...answer.data.citations].join(" ");
		for (const match of haystack.matchAll(
			/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
		)) {
			const slug = match[1];
			if (slug && !slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}
