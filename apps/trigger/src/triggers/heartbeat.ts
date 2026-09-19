import { logger, task } from "@trigger.dev/sdk";

export const heartbeat = task({
	id: "heartbeat",
	maxDuration: 30,
	run: async (payload: { note?: string }) => {
		logger.log("heartbeat run", { note: payload.note ?? "ok" });
		return { ok: true, ranAt: new Date().toISOString() };
	},
});
