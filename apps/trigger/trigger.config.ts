import { defineConfig } from "@trigger.dev/sdk/v3";

/**
 * Self-hosted Trigger.dev config for Comp AI CRM's background jobs.
 *
 * Points at GSI's self-hosted instance (trigger.carvisgsi.xyz) via
 * TRIGGER_API_URL — never rely on the SDK default (Trigger.dev Cloud).
 * The project ref below must match a real project created in that
 * self-hosted instance's web UI before `trigger deploy` will succeed.
 */
export default defineConfig({
	project: process.env.TRIGGER_PROJECT_REF ?? "proj_comp_ai_crm_self_hosted",
	runtime: "node",
	logLevel: "log",
	dirs: ["src/triggers"],
	maxDuration: 300,
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 2_000,
			maxTimeoutInMs: 30_000,
			factor: 2,
		},
	},
});
