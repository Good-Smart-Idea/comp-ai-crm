import { bdclient, ScrapeJob } from "@brightdata/sdk";
import { z } from "zod";

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

const linkedInCompany = z
	.object({
		id: z.string().optional(),
		name: z.string().optional(),
		website: z.string().optional(),
		industries: z.string().optional(),
		country_code: z.string().optional(),
		locations: z.array(z.string()).optional(),
	})
	.passthrough();

export type LinkedInCompanyRecord = z.infer<typeof linkedInCompany>;

const linkedInExperienceRole = z
	.object({
		title: z.string().optional(),
		company: z.string().optional(),
		start_date: z.string().optional(),
		end_date: z.string().optional(),
	})
	.passthrough();

const linkedInCurrentCompany = z
	.object({
		name: z.string().optional(),
		title: z.string().optional(),
	})
	.passthrough();

const linkedInPerson = z
	.object({
		name: z.string().optional(),
		city: z.string().optional(),
		current_company: linkedInCurrentCompany.optional(),
		experience: z.array(linkedInExperienceRole).optional(),
	})
	.passthrough();

export type LinkedInPersonRecord = z.infer<typeof linkedInPerson>;
export type LinkedInExperienceRole = z.infer<typeof linkedInExperienceRole>;
export type LinkedInCurrentCompany = z.infer<typeof linkedInCurrentCompany>;

const sdkArrayEntry = z.record(z.string(), z.unknown());

type ScrapeSdkResult = Awaited<
	ReturnType<bdclient["scrape"]["linkedin"]["collectCompanies"]>
>;

function firstEntry<T>(
	schema: z.ZodType<T>,
	result: ScrapeSdkResult,
): T | null {
	if (result instanceof ScrapeJob) return null;
	const asArray = z.array(sdkArrayEntry).safeParse(result);
	if (asArray.success) {
		const parsed = schema.safeParse(asArray.data[0]);
		return parsed.success ? parsed.data : null;
	}
	const asJson = z.string().safeParse(result);
	if (!asJson.success) return null;
	let document: unknown;
	try {
		document = JSON.parse(asJson.data);
	} catch {
		return null;
	}
	const entry = Array.isArray(document) ? document[0] : document;
	const parsed = schema.safeParse(entry);
	return parsed.success ? parsed.data : null;
}

export async function linkedInCompanyByUrl(
	url: string,
): Promise<LinkedInCompanyRecord | null> {
	const bd = brightDataClient();
	if (!bd) return null;
	try {
		const result = await bd.scrape.linkedin.collectCompanies([url], {});
		return firstEntry(linkedInCompany, result);
	} catch {
		return null;
	}
}

export async function linkedInPersonByUrl(
	url: string,
): Promise<LinkedInPersonRecord | null> {
	const bd = brightDataClient();
	if (!bd) return null;
	try {
		const result = await bd.scrape.linkedin.collectProfiles([url], {});
		return firstEntry(linkedInPerson, result);
	} catch {
		return null;
	}
}
