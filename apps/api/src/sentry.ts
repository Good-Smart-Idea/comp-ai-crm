import * as Sentry from "@sentry/bun";

/**
 * Self-hosted Sentry (CTRL-192). No-op unless SENTRY_DSN is set, so dev, tests
 * and CI never report. Returns whether reporting is enabled.
 */
export function initSentry(
	env: Record<string, string | undefined> = process.env,
): boolean {
	if (!env.SENTRY_DSN) return false;

	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? "development",
		release: env.SENTRY_RELEASE,
		tracesSampleRate: 0,
	});
	return true;
}
