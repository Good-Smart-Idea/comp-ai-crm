import { companyResearch } from "./company-research";
import { namesMatch } from "./names";

export type PortraitSource = "linkedin" | "github" | "employer-site";

export type PortraitCandidate = {
	source: PortraitSource;
	url: string;
};

export type PortraitSubject = {
	id: string;
	name: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	companyName: string | null;
	companyDomain: string | null;
};

export async function findPortrait(
	subject: PortraitSubject,
	spend: (units?: number) => { ok: boolean; reason?: string },
	researchReady = companyResearch.available(),
): Promise<
	| { found: true; candidate: PortraitCandidate }
	| { found: false; tried: string[]; reason?: string }
> {
	const tried: string[] = [];

	const login = githubLogin(subject.githubUrl);
	if (login) {
		return {
			found: true,
			candidate: {
				source: "github",
				url: `https://github.com/${encodeURIComponent(login)}.png?size=460`,
			},
		};
	}

	if (subject.companyDomain && subject.name && !researchReady) {
		tried.push(
			"Bright Data is not connected, so the company site was not read",
		);
	}

	if (subject.companyDomain && subject.name && researchReady) {
		const charge = spend(2);
		if (!charge.ok) return { found: false, tried, reason: charge.reason };

		const fromSite = await fromEmployerSite(subject);
		if (fromSite) return { found: true, candidate: fromSite };
		tried.push("Not on the company's own site");
	}

	return { found: false, tried };
}

const employeeImage =
	/<img[^>]+(?:alt=["']([^"']+)["'][^>]+src=["']([^"']+)["']|src=["']([^"']+)["'][^>]+alt=["']([^"']+)["'])/gi;

async function fromEmployerSite(
	subject: PortraitSubject,
): Promise<PortraitCandidate | null> {
	const result = await companyResearch.read(`https://${subject.companyDomain}`);
	if (result.outcome !== "found") return null;
	for (const match of result.text.matchAll(employeeImage)) {
		const name = match[1] ?? match[4] ?? null;
		const photoUrl = match[2] ?? match[3] ?? null;
		if (!name || !photoUrl || !namesMatch(name, subject.name)) continue;
		try {
			const parsed = new URL(photoUrl, `https://${subject.companyDomain}`);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
			return { source: "employer-site", url: parsed.toString() };
		} catch {}
	}

	return null;
}

function githubLogin(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());
		const host = url.hostname.toLowerCase().replace(/^www\./, "");
		if (host !== "github.com") return null;

		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length !== 1) return null;

		return segments[0] ?? null;
	} catch {
		return null;
	}
}
