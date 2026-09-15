"use client";

import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Separator } from "@crm/ui/components/separator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { membersSearchParams } from "./members-search-params";

const ROLE_LABEL = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
} as const;

type Role = keyof typeof ROLE_LABEL;

type MemberRow = RouterOutputs["workspace"]["members"]["rows"][number];
type PreauthorizationRow =
	RouterOutputs["workspace"]["preauthorizations"][number];

function columns(
	canChangeRoles: boolean,
	onChangeRole: (member: MemberRow, role: Role) => void,
	pending: boolean,
): DataTableColumn<MemberRow>[] {
	return [
		{
			id: "name",
			header: "Name",
			sortable: true,
			hideable: false,
			width: "w-[34%]",
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<PersonAvatar
						size="sm"
						src={row.image}
						name={row.name}
						email={row.email}
					/>
					<span className="truncate font-medium">{row.name}</span>
					{row.isViewer ? (
						<span className="text-muted-foreground text-xs">You</span>
					) : null}
				</span>
			),
		},
		{
			id: "email",
			header: "Email",
			sortable: true,
			width: "w-[32%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="truncate text-muted-foreground">{row.email}</span>
			),
		},
		{
			id: "role",
			header: "Role",
			sortable: true,
			width: "w-[14%]",
			cell: (row) => (
				<span className="text-muted-foreground">{ROLE_LABEL[row.role]}</span>
			),
		},
		{
			id: "joinedAt",
			header: "Joined",
			label: "Joined date",
			sortable: true,
			align: "right",
			width: "w-[14%]",
			hideBelow: "sm",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.joinedAt} />
				</span>
			),
		},
		{
			id: "actions",
			header: <span className="sr-only">Actions</span>,
			label: "Actions",
			hideable: false,
			align: "right",
			width: "w-[6%]",
			cell: (row) =>
				canChangeRoles ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" disabled={pending}>
								<Icon icon={OverflowMenuHorizontal} />
								<span className="sr-only">Change {row.name}'s role</span>
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							{(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
								<DropdownMenuItem
									key={role}
									data-checked={row.role === role}
									onSelect={() => {
										if (row.role === role) return;
										onChangeRole(row, role);
									}}
								>
									{ROLE_LABEL[role]}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : null,
		},
	];
}

export function MembersTable() {
	const [preauthorizationOpen, setPreauthorizationOpen] = useState(false);
	const [email, setEmail] = useState("");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { query, input } = useTableQuery(membersSearchParams);

	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const members = useQuery({
		...trpc.workspace.members.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const preauthorizations = useQuery(
		trpc.workspace.preauthorizations.queryOptions(),
	);

	const setRole = useMutation(
		trpc.workspace.setMemberRole.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success("Role changed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const preauthorize = useMutation(
		trpc.workspace.preauthorize.mutationOptions({
			onSuccess: async () => {
				setEmail("");
				setPreauthorizationOpen(false);
				await cache.workspace();
				toast.success("Member preauthorized.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revokePreauthorization = useMutation(
		trpc.workspace.revokePreauthorization.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success("Preauthorization revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const facetCounts = members.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "role",
			label: "Role",
			options: (Object.keys(ROLE_LABEL) as Role[]).flatMap((role) =>
				(facetCounts?.role?.[role] ?? 0) > 0
					? [{ value: role, label: ROLE_LABEL[role] }]
					: [],
			),
		},
	];

	const canManagePreauthorizations = workspace.data?.canChangeRoles ?? false;
	const submitPreauthorization = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		preauthorize.mutate({ email, role: "member" });
	};

	return (
		<div className="flex min-h-0 flex-col gap-6">
			<DataTable
				query={query}
				search={<ListSearch placeholder="Search by name or email…" />}
				columns={columns(
					workspace.data?.canChangeRoles ?? false,
					(member, role) => setRole.mutate({ memberId: member.id, role }),
					setRole.isPending,
				)}
				rows={members.data?.rows ?? []}
				total={members.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={members.isFetching}
				empty="Nobody matches this view."
			/>

			<section
				className="flex flex-col gap-3"
				aria-labelledby="pending-members"
			>
				<div className="flex items-center justify-between gap-3">
					<div className="flex flex-col gap-1">
						<h2
							id="pending-members"
							className="font-heading text-sm font-medium"
						>
							Pending members
						</h2>
						<p className="text-muted-foreground text-xs">
							They join after a verified sign-in with this exact email.
						</p>
					</div>
					{canManagePreauthorizations ? (
						<Dialog
							open={preauthorizationOpen}
							onOpenChange={setPreauthorizationOpen}
						>
							<DialogTrigger asChild>
								<Button>Preauthorize member</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Preauthorize member</DialogTitle>
									<DialogDescription>
										This grants member access after a verified sign-in.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={submitPreauthorization}>
									<FieldGroup>
										<Field>
											<FieldLabel htmlFor="preauthorization-email">
												Email
											</FieldLabel>
											<Input
												id="preauthorization-email"
												name="email"
												type="email"
												autoComplete="email"
												value={email}
												onChange={(event) => setEmail(event.target.value)}
												required
											/>
											<FieldDescription>
												The email must match the sign-in allow-list exactly.
											</FieldDescription>
										</Field>
										<DialogFooter>
											<DialogClose asChild>
												<Button variant="outline" type="button">
													Cancel
												</Button>
											</DialogClose>
											<Button type="submit" disabled={preauthorize.isPending}>
												Preauthorize
											</Button>
										</DialogFooter>
									</FieldGroup>
								</form>
							</DialogContent>
						</Dialog>
					) : null}
				</div>
				{preauthorizations.data && preauthorizations.data.length > 0 ? (
					<ul className="flex flex-col gap-2">
						{preauthorizations.data.map(
							(preauthorization: PreauthorizationRow) => (
								<li key={preauthorization.id} className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-3">
										<span className="truncate text-sm">
											{preauthorization.email}
										</span>
										<span className="flex items-center gap-2 text-muted-foreground text-xs">
											{ROLE_LABEL[preauthorization.role]}
											{canManagePreauthorizations ? (
												<Button
													variant="ghost"
													size="sm"
													disabled={revokePreauthorization.isPending}
													onClick={() =>
														revokePreauthorization.mutate({
															id: preauthorization.id,
														})
													}
												>
													Revoke
												</Button>
											) : null}
										</span>
									</div>
									<Separator />
								</li>
							),
						)}
					</ul>
				) : (
					<p className="text-muted-foreground text-xs">No pending members.</p>
				)}
			</section>
		</div>
	);
}
