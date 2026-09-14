export type Organisation = { name: string | null; domain: string | null };

export type Role = {
	title: string | null;
	organisation: Organisation;
	startDate: string | null;
	endDate: string | null;
	location: string | null;
	description: string | null;
	isCurrent: boolean;
};

export type Study = {
	institution: Organisation;
	degree: string | null;
	fieldOfStudy: string | null;
	startDate: string | null;
	endDate: string | null;
};

export type Person = {
	firstName: string | null;
	lastName: string | null;
	fullName: string | null;
	bio: string | null;
	location: string | null;
	email: string | null;
	photoUrl: string | null;
	profileUrl: string | null;
	socialUrls: string[];
	websiteUrls: string[];
	skills: string[];
	currentRoles: Role[];
	experience: Role[];
	education: Study[];
};

export type PersonMatch =
	| { outcome: "found"; person: Person }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

export type IdentityClues = {
	email: string;
	firstName: string | null;
	lastName: string | null;
	companyName: string | null;
	companyDomain: string | null;
};

const unavailable = (): PersonMatch => ({
	outcome: "skipped",
	reason: "A managed person research provider is not configured.",
});

export async function personByProfileUrl(_profileUrl: string): Promise<PersonMatch> {
	return unavailable();
}

export async function personByClues(_clues: IdentityClues): Promise<PersonMatch> {
	return unavailable();
}

export function photoUrl(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw.trim());
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

export function slugFromProfileUrl(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw.trim());
		const host = url.hostname.toLowerCase();
		if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
		const [section, slug] = url.pathname.split("/").filter(Boolean);
		return section === "in" && slug ? decodeURIComponent(slug) : null;
	} catch {
		return null;
	}
}
