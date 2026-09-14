import { type Db, db } from "@crm/db";
import { WORKSPACE_ID, workspaceSlug } from "@crm/db/workspace";
import { isWorkspaceEmail, normalizeWorkspaceEmail } from "./workspace";

export { WORKSPACE_ID };

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export const DEFAULT_WORKSPACE_PREAUTHORIZATIONS = [
	{ email: "mihai@goodsmartidea.com", role: "member" },
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManagePreauthorizations(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageConnections(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageTracking(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const workspace = await tx.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: DEFAULT_WORKSPACE_NAME,
					slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
					createdAt: new Date(),
				},
				update: {},
				select: { id: true, name: true, slug: true },
			});

			const slug = workspaceSlug(workspace.name);
			if (workspace.slug !== slug) {
				await tx.organization.update({
					where: { id: workspace.id },
					data: { slug },
				});
			}

			const enrolled = await tx.member.count({
				where: { organizationId: workspace.id },
			});
			if (enrolled === 0) {
				await tx.workspacePreauthorization.createMany({
					data: DEFAULT_WORKSPACE_PREAUTHORIZATIONS.map(
						(preauthorization) => ({
							id: `workspace-preauthorization-${preauthorization.email.replace("@", "-").replaceAll(".", "-")}`,
							organizationId: workspace.id,
							email: preauthorization.email,
							role: preauthorization.role,
						}),
					),
					skipDuplicates: true,
				});
			}

			const user = await tx.user.findUnique({
				where: { id: userId },
				select: { email: true, emailVerified: true },
			});
			if (!user?.emailVerified || !isWorkspaceEmail(user.email)) {
				return undefined;
			}

			const preauthorizations = await tx.workspacePreauthorization.findMany({
				where: { organizationId: workspace.id },
				select: { id: true, email: true, role: true },
			});
			const roleByEmail = new Map(
				preauthorizations.map((preauthorization) => [
					preauthorization.email,
					toWorkspaceRole(preauthorization.role),
				]),
			);

			if (enrolled === 0) {
				const existing = await tx.user.findMany({
					where: { emailVerified: true },
					select: { id: true, email: true },
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				});
				const eligible = existing.filter((candidate) =>
					isWorkspaceEmail(candidate.email),
				);

				await tx.member.createMany({
					data: eligible.map((candidate, index) => ({
						id: crypto.randomUUID(),
						organizationId: workspace.id,
						userId: candidate.id,
						role:
							roleByEmail.get(normalizeWorkspaceEmail(candidate.email) ?? "") ??
							(index === 0 ? "owner" : "member"),
						createdAt: new Date(),
					})),
					skipDuplicates: true,
				});
			}

			const preauthorization = preauthorizations.find(
				(candidate) => candidate.email === normalizeWorkspaceEmail(user.email),
			);
			await tx.member.upsert({
				where: {
					organizationId_userId: { organizationId: workspace.id, userId },
				},
				create: {
					id: crypto.randomUUID(),
					organizationId: workspace.id,
					userId,
					role: preauthorization
						? toWorkspaceRole(preauthorization.role)
						: "member",
					createdAt: new Date(),
				},
				update: {},
			});

			if (preauthorization) {
				await tx.workspacePreauthorization.delete({
					where: { id: preauthorization.id },
				});
			}

			return workspace.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in workspace ${WORKSPACE_ID}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}

export function toWorkspaceRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

export type WorkspaceMemberReader = Pick<Db, "member">;

export async function workspaceRoleOf(
	userId: string,
	client: WorkspaceMemberReader = db,
): Promise<WorkspaceRole | null> {
	const member = await client.member.findUnique({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		select: { role: true },
	});

	return member ? toWorkspaceRole(member.role) : null;
}
