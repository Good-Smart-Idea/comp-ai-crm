import "@crm/env/load";

type AllowList = {
	domains: readonly string[];
	addresses: readonly string[];
};

const EMPTY: AllowList = { domains: [], addresses: [] };

let cachedSource: string | undefined;
let cached: AllowList = EMPTY;

function allowList(): AllowList {
	const source = process.env.ALLOWED_SIGN_IN ?? "";
	if (source === cachedSource) return cached;

	const domains: string[] = [];
	const addresses: string[] = [];

	for (const raw of source.split(",")) {
		const entry = raw.trim().toLowerCase().replace(/^@/, "");
		if (!entry) continue;
		(entry.includes("@") ? addresses : domains).push(entry);
	}

	cachedSource = source;
	cached = { domains, addresses };
	return cached;
}

export function workspaceDomains(): readonly string[] {
	return allowList().domains;
}

export function primaryWorkspaceDomain(): string | undefined {
	return allowList().domains[0];
}

export function hasSignInAllowList(): boolean {
	const { domains, addresses } = allowList();
	return domains.length > 0 || addresses.length > 0;
}

export function normalizeWorkspaceEmail(
	email: string | null | undefined,
): string | undefined {
	const value = email?.trim().toLowerCase();
	if (!value) return undefined;

	const parts = value.split("@");
	if (parts.length !== 2) return undefined;

	const [local, host] = parts;
	return local && host ? value : undefined;
}

export function isWorkspaceEmail(email: string | null | undefined): boolean {
	const value = normalizeWorkspaceEmail(email);
	if (!value) return false;

	const host = value.split("@")[1];
	if (!host) return false;

	const { domains, addresses } = allowList();

	return addresses.includes(value) || domains.includes(host);
}
