export const SECOND_MS = 1_000;

export const SNAPSHOT_POLLER = {
	poll: {
		intervalMs: 5 * SECOND_MS,
		maxAttempts: 60,
	},
	heartbeat: {
		datasetId: "gd_l1vijqt9jfj7olije",
		targetUrl: "https://www.crunchbase.com/organization/openai",
	},
} as const;
