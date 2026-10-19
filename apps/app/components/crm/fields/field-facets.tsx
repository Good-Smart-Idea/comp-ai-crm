"use client";

import type { DataTableFacet } from "@crm/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { FieldEntity } from "./fields-entity";

/**
 * SELECT and USER admin fields become filter facets automatically — no
 * per-field opt-in, mirroring `fields.filterableFieldsFor` on the API.
 */
export function fieldFacetOptions(
	field: {
		type: string;
		options: { id: string; label: string }[];
	},
	users: { id: string; name: string }[] | undefined,
	counts: Record<string, number> | undefined,
): { value: string; label: string }[] {
	const options =
		field.type === "USER"
			? (users ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				}))
			: field.options.map((option) => ({
					value: option.id,
					label: option.label,
				}));

	return field.type === "USER"
		? options.filter((option) => (counts?.[option.value] ?? 0) > 0)
		: options;
}

export function useFieldFacets(
	entity: FieldEntity,
	facetCounts: Record<string, Record<string, number>> | undefined,
): DataTableFacet[] {
	const trpc = useTRPC();
	const fields = useQuery(trpc.fields.filters.queryOptions({ entity }));
	const users = useQuery(trpc.users.list.queryOptions());

	return useMemo(() => {
		if (!fields.data) return [];

		return fields.data.map((field) => ({
			id: `field:${field.key}`,
			label: field.label,
			options: fieldFacetOptions(
				field,
				users.data,
				facetCounts?.[`field:${field.key}`],
			),
		}));
	}, [fields.data, users.data, facetCounts]);
}
