import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { ResearchForm } from "./research-form";

export const metadata: Metadata = {
	title: "Company enrichment",
};

export const instant = false;

export default async function ResearchKeyPage() {
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title="Company enrichment"
				description="Connect Context now, or skip it and configure company enrichment later in Settings."
			/>

			<ResearchForm signupUrl={CONTEXT_DEV_SIGNUP_URL} />
		</AuthShell>
	);
}
