import { defineConfig } from "@trigger.dev/sdk";

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
