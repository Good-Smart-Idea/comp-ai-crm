import { bdclient, ScrapeJob } from "@brightdata/sdk";

let client: bdclient | null = null;

function config(): { apiKey: string } | null {
	const apiKey = process.env.BRIGHTDATA_API_TOKEN?.trim();
	return apiKey ? { apiKey } : null;
}

export function brightDataClientEnabled(): boolean {
	return config() !== null;
}

export function brightDataClient(): bdclient | null {
	const cfg = config();
	if (!cfg) return null;
	if (!client) client = new bdclient({ apiKey: cfg.apiKey });
	return client;
}

function parseRecord(result: unknown): Record<string, unknown> | null {
	if (typeof result === "string") {
		try {
			const parsed = JSON.parse(result) as unknown;
			if (Array.isArray(parsed))
				return (parsed[0] as Record<string, unknown> | undefined) ?? null;
			if (parsed && typeof parsed === "object")
				return parsed as Record<string, unknown>;
			return null;
		} catch {
			return null;
		}
	}
	if (result instanceof ScrapeJob) return null;
	if (Array.isArray(result))
		return (result[0] as Record<string, unknown> | undefined) ?? null;
	if (result && typeof result === "object")
		return result as Record<string, unknown>;
	return null;
}

export type LinkedInCompanyRecord = {
	id?: string;
	name?: string;
	country_code?: string;
	locations?: string[];
	[key: string]: unknown;
};

export async function linkedInCompanyByUrl(
	url: string,
): Promise<LinkedInCompanyRecord | null> {
	const bd = brightDataClient();
	if (!bd) return null;
	try {
		const result = await bd.scrape.linkedin.collectCompanies([url], {});
		const record = parseRecord(result);
		return (record as LinkedInCompanyRecord | null) ?? null;
	} catch {
		return null;
	}
}

export type LinkedInPersonRecord = {
	name?: string;
	[key: string]: unknown;
};

export async function linkedInPersonByUrl(
	url: string,
): Promise<LinkedInPersonRecord | null> {
	const bd = brightDataClient();
	if (!bd) return null;
	try {
		const result = await bd.scrape.linkedin.collectProfiles([url], {});
		const record = parseRecord(result);
		return (record as LinkedInPersonRecord | null) ?? null;
	} catch {
		return null;
	}
}
