import "@crm/env/load";

import { companyResearch } from "./company-research";

export const BRIGHT_DATA_COMPANY_RESEARCH = "BRIGHT_DATA_COMPANY_RESEARCH";

export const BRIGHT_DATA_COMPANY_RESEARCH_SOURCE =
	"Bright Data managed connector";

export const MANAGED_PERSON_RESEARCH = "MANAGED_PERSON_RESEARCH";

export const MANAGED_PERSON_RESEARCH_SOURCE =
	"managed person research provider";

export type Capability = {
	readonly id: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
	readonly from: string;
};

export async function capabilities(): Promise<readonly Capability[]> {
	return capabilitiesFrom();
}

export function capabilitiesFrom(): readonly Capability[] {
	const fromEnv = (id: string) => ({
		id,
		from: id,
		enabled: Boolean(process.env[id]?.trim()),
	});

	return [
		{
			...fromEnv("PERPLEXITY_API_KEY"),
			label: "Web research",
			gives:
				"open-web context with citations, and the search that finds a LinkedIn slug in the first place",
		},
		{
			id: BRIGHT_DATA_COMPANY_RESEARCH,
			from: "Ada managed connector",
			label: "Company research",
			gives: "official company pages and search discovery for company facts",
			enabled: companyResearch.available(),
		},
		{
			...fromEnv("BLOB_READ_WRITE_TOKEN"),
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
		},
	];
}

export async function enabled(id: string): Promise<boolean> {
	return (await capabilities()).some(
		(capability) => capability.id === id && capability.enabled,
	);
}

export type UnavailableCapability = {
	ok: false;
	configured: false;
	reason: string;
};

export function unavailable(source: string): UnavailableCapability {
	return {
		ok: false,
		configured: false,
		reason: `This install has no ${source}, so that source is unavailable. This is not a failure and retrying will not help — use what the CRM already knows, and say in your write-up what you could not check.`,
	};
}

export async function logCapabilities(): Promise<void> {
	for (const capability of await capabilities()) {
		console.log(
			`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.from})`,
		);
	}
}

export async function capabilitiesMarkdown(): Promise<string> {
	return markdownFor(await capabilities());
}

export function markdownFor(all: readonly Capability[]): string {
	const on = all.filter((capability) => capability.enabled);
	const off = all.filter((capability) => !capability.enabled);
	const lines = ["## What you can use here", ""];
	if (on.length === 0) {
		lines.push(
			"No outside sources are configured on this install. Everything you can learn is already in the CRM — email threads, meetings, signature blocks — and `read_crm_history` reads all of it for free. That is often enough to settle who somebody is. Record what it shows, and leave the rest empty.",
		);
		return lines.join("\n");
	}
	lines.push("Available:");
	for (const capability of on)
		lines.push(`- **${capability.label}** — ${capability.gives}.`);
	if (off.length > 0) {
		lines.push("", "Not configured here, so do not plan around them:");
		for (const capability of off) lines.push(`- ${capability.label}`);
		lines.push(
			"",
			"Their tools will tell you the same thing if you call them. Note what you could not check rather than guessing at it.",
		);
	}
	return lines.join("\n");
}
