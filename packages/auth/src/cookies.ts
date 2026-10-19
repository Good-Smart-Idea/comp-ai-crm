export const AUTH_COOKIE_PREFIX = "crm";
export const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

export function sessionCookieHeaders(
	value: string,
	maxAgeSeconds: number,
): [string, string] {
	const attributes = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
	return [
		`${SESSION_COOKIE_NAME}=${value}; ${attributes}`,
		`${SECURE_SESSION_COOKIE_NAME}=${value}; ${attributes}; Secure`,
	];
}
