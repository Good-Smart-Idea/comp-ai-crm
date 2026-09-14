"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function CompanyResearchProvider() {
	const trpc = useTRPC();
	const provider = useQuery(
		trpc.settings.companyResearchProvider.queryOptions(),
	);
	if (!provider.data) return null;
	const { configured, provider: name } = provider.data;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Company research</CardTitle>
				<CardDescription>
					Ada manages this connector. Browser users cannot add or view provider
					credentials.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center justify-between gap-3">
					<span>{name}</span>
					<StatusIndicator
						size="sm"
						tone={configured ? "success" : "warning"}
						label={configured ? "Available" : "Unavailable"}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
