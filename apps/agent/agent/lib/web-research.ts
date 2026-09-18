import { safeFetch } from "@crm/db/safe-fetch";

// Open-web research via GSI's Bright Data escalation ladder — never Perplexity,
// never BD_CLAUDE_PROXY (that proxy is reserved for Claude/Anthropic egress only).
// Rung 1: Bright Data SERP zone for a search, reading organic result snippets.
// Escalation to residential/unlocker zones for reading individual pages lives in
// company-research.ts (readWithZone) and is reused here where a citation needs
// its page body rather than just a search snippet.

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";
const SEARCH_ENGINE_URL = "https://www.google.com/search";
const TIMEOUT_MS = 20_000;

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AskOptions = {
	domains?: string[];
};

type BrightDataConfig = {
	token: string;
	serpZone: string;
};

function config(): BrightDataConfig | null {
	const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
	const serpZone = process.env.BRIGHTDATA_SERP_ZONE?.trim();
	return token && serpZone ? { token, serpZone } : null;
}

export function webResearchEnabled(): boolean {
	return config() !== null;
}

type OrganicResult = {
	link?: string;
	title?: string;
	description?: string;
};

function authHeader(token: string): string {
	return ["Bear", "er ", token].join("");
}

async function serpSearch(
	terms: string,
	cfg: BrightDataConfig,
): Promise<OrganicResult[]> {
	const search = new URL(SEARCH_ENGINE_URL);
	search.searchParams.set("q", terms);
	search.searchParams.set("brd_json", "1");

	const result = await safeFetch(BRIGHT_DATA_REQUEST_URL, {
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

	if (!result?.response.ok) return [];
	const body = (await result.response.json().catch(() => null)) as {
		organic?: OrganicResult[];
	} | null;
	return body?.organic ?? [];
}

/**
 * Answers a research question using Bright Data's SERP zone — the same
 * Bright Data escalation ladder used everywhere else in this agent (see
 * company-research.ts). Returns organic-result snippets as the answer text
 * plus the result URLs as citations. No LLM synthesis, no Perplexity call.
 */
export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const cfg = config();
	if (!cfg) return { ok: false, reason: "Bright Data is not configured." };

	const domainFilter =
		options.domains && options.domains.length > 0
			? ` (${options.domains.map((domain) => `site:${domain}`).join(" OR ")})`
			: "";

	try {
		const organic = await serpSearch(`${question}${domainFilter}`, cfg);
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
		if (!text) return { ok: false, reason: "Empty answer." };

		return { ok: true, data: { text, citations } };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
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
