import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { companyResearch } from "../lib/company-research";
import { spend } from "../lib/focus";

export default defineTool({
	description:
		"Read a company's official site and write a research brief to its timeline.",
	inputSchema: z.object({ companyId: z.string() }),
	async execute({ companyId }) {
		const company = await db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				ownerId: true,
			},
		});
		if (!company)
			return { written: false as const, reason: "No such company." };
		const url =
			company.website ?? (company.domain ? `https://${company.domain}` : null);
		if (!url)
			return {
				written: false as const,
				reason: "This company has no website.",
			};
		if (!companyResearch.available())
			return {
				written: false as const,
				reason: "Bright Data is not configured.",
			};
		const charge = spend(2);
		if (!charge.ok) return { written: false as const, reason: charge.reason };
		const result = await companyResearch.read(url);
		if (result.outcome === "failed")
			return { written: false as const, reason: result.reason };
		const author =
			company.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;
		if (!author)
			return { written: false as const, reason: "No user to attribute to." };
		const activity = await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Research brief — ${company.name}`,
				body: result.text.slice(0, 20_000),
				occurredAt: new Date(),
				companyId: company.id,
				createdById: author,
				meta: {
					source: "bright-data",
					endpoint: "company-page",
					agent: "people-research",
					evidence: JSON.stringify(result.raw),
				},
			},
			select: { id: true },
		});
		await db.company.update({
			where: { id: companyId },
			data: { lastActivityAt: new Date() },
		});
		return { written: true as const, activityId: activity.id };
	},
});
