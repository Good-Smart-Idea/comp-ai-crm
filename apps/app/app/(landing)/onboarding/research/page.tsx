import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Company research" };
export const instant = false;

export default async function ResearchKeyPage() {
	await requireMailboxAccess();
	return (
		<AuthShell>
			<AuthHeading
				title="Company research"
				description="Ada manages the Bright Data connector. You can use the CRM while company research is unavailable."
			/>
		</AuthShell>
	);
}
