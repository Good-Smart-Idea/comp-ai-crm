import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { WorkspaceService } from "../src/workspace/workspace.service";

const suffix = crypto.randomUUID();
const ownerId = `preauthorization-owner-${suffix}`;
const memberId = `preauthorization-member-${suffix}`;
const otherOrganizationId = `preauthorization-other-${suffix}`;
const otherPreauthorizationId = `preauthorization-other-row-${suffix}`;
const otherMemberRowId = `preauthorization-other-member-${suffix}`;
const service = new WorkspaceService(db);

beforeAll(async () => {
	process.env.ALLOWED_SIGN_IN = "example.test";
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{
				id: ownerId,
				name: "Preauthorization Owner",
				email: `${ownerId}@example.test`,
				emailVerified: true,
			},
			{
				id: memberId,
				name: "Preauthorization Member",
				email: `${memberId}@example.test`,
				emailVerified: true,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `preauthorization-owner-member-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `preauthorization-member-member-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.organization.create({
		data: {
			id: otherOrganizationId,
			name: "Other Workspace",
			slug: `other-${suffix}`,
			createdAt: new Date(),
			preauthorizations: {
				create: {
					id: otherPreauthorizationId,
					email: `other-${suffix}@example.test`,
					role: "member",
				},
			},
			members: {
				create: {
					id: otherMemberRowId,
					userId: memberId,
					role: "member",
					createdAt: new Date(),
				},
			},
		},
	});
});

afterAll(async () => {
	await db.organization.deleteMany({
		where: { id: otherOrganizationId },
	});
	await db.workspacePreauthorization.deleteMany({
		where: { email: { contains: suffix } },
	});
	await db.member.deleteMany({ where: { userId: { in: [ownerId, memberId] } } });
	await db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("workspace preauthorizations", () => {
	it("allows an owner to assign a pending member role", async () => {
		const email = `pending-${suffix}@example.test`;
		const preauthorization = await service.preauthorize(ownerId, {
			email,
			role: "member",
		});

		expect(preauthorization).toMatchObject({ email, role: "member" });
		expect(await service.preauthorizations(ownerId)).toContainEqual(
			expect.objectContaining({ id: preauthorization.id, email }),
		);
	});

	it("refuses a member and an email outside the exact allow-list", async () => {
		await expect(
			service.preauthorize(memberId, {
				email: `denied-${suffix}@example.test`,
				role: "member",
			}),
		).rejects.toThrow("Only an owner or an admin");
		await expect(
			service.preauthorize(ownerId, {
				email: `denied-${suffix}@mail.example.test`,
				role: "member",
			}),
		).rejects.toThrow("exact sign-in allow-list");
	});

	it("refuses preauthorization and role changes from another workspace", async () => {
		await expect(
			service.revokePreauthorization(ownerId, otherPreauthorizationId),
		).rejects.toThrow("was not found");
		await expect(
			service.setMemberRole(ownerId, {
				memberId: otherMemberRowId,
				role: "admin",
			}),
		).rejects.toThrow("not in this workspace");
	});
});
