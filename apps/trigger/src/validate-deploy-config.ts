const triggerApiUrl = process.env.TRIGGER_API_URL?.trim();

if (!triggerApiUrl) {
	throw new Error("TRIGGER_API_URL is required for Trigger.dev deployment.");
}

const url = new URL(triggerApiUrl);
if (url.protocol !== "https:" && url.protocol !== "http:") {
	throw new Error("TRIGGER_API_URL must use HTTP or HTTPS.");
}
