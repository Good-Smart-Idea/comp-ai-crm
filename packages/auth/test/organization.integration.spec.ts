import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	ensureWorkspaceMembership,
	ensureWorkspaceMembershipForVerifiedSession,
	WORKSPACE_ID,
} from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

let firstId: string;
let secondId: string;

const seedUser = async (label: string, createdAt: Date): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label),
			emailVerified: true,
			createdAt,
			updatedAt: createdAt,
		},
		select: { id: true },
	});

	return user.id;
};

const roleOf = async (userId: string): Promise<string | null> => {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		select: { role: true },
	});

	return member?.role ?? null;
};

const clear = async () => {
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});

	const strangers = await db.member.count({
		where: { organizationId: WORKSPACE_ID },
	});

	if (strangers > 0) {
		throw new Error(
			`${strangers} member row(s) this spec did not create are in the workspace, and it needs an empty one to test the owner backfill. It will not delete them: that is somebody's access. Point TEST_DATABASE_URL at a database of your own, or find the spec that leaked them.`,
		);
	}
};

beforeEach(async () => {
	process.env.ALLOWED_SIGN_IN = "example.test,mihai@goodsmartidea.com";
	await clear();

	firstId = await seedUser("first", new Date("2020-01-01T00:00:00Z"));
	secondId = await seedUser("second", new Date("2021-01-01T00:00:00Z"));
});

afterAll(clear);

describe("ensureWorkspaceMembership", () => {
	it("creates the one workspace and enrols everyone who already had an account", async () => {
		const workspaceId = await ensureWorkspaceMembership(secondId);

		expect(workspaceId).toBe(WORKSPACE_ID);
		expect(await roleOf(firstId)).toBe("owner");
		expect(await roleOf(secondId)).toBe("member");
	});

	it("is idempotent, so signing in again neither duplicates nor re-roles", async () => {
		await ensureWorkspaceMembership(secondId);

		await db.member.update({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: secondId,
				},
			},
			data: { role: "admin" },
		});

		await ensureWorkspaceMembership(secondId);
		await ensureWorkspaceMembership(secondId);

		const rows = await db.member.findMany({
			where: { organizationId: WORKSPACE_ID, userId: secondId },
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("admin");
	});

	it("joins someone who signs up later as a member", async () => {
		await ensureWorkspaceMembership(secondId);

		const laterId = await seedUser("later", new Date("2026-01-01T00:00:00Z"));

		await ensureWorkspaceMembership(laterId);

		expect(await roleOf(laterId)).toBe("member");
	});

	it("leaves the owner alone when a later arrival signs in", async () => {
		await ensureWorkspaceMembership(secondId);

		const laterId = await seedUser("later", new Date("2026-01-01T00:00:00Z"));

		await ensureWorkspaceMembership(laterId);

		expect(await roleOf(firstId)).toBe("owner");

		const owners = await db.member.count({
			where: { organizationId: WORKSPACE_ID, role: "owner" },
		});

		expect(owners).toBe(1);
	});

	it("stores Mihai as pending without creating a user", async () => {
		await ensureWorkspaceMembership(firstId);

		expect(
			await db.user.findUnique({
				where: { email: "mihai@goodsmartidea.com" },
			}),
		).toBeNull();
		expect(
			await db.workspacePreauthorization.findUnique({
				where: {
					organizationId_email: {
						organizationId: WORKSPACE_ID,
						email: "mihai@goodsmartidea.com",
					},
				},
			}),
		).not.toBeNull();
	});

	it("refuses an unverified or forged email", async () => {
		const unverified = await db.user.create({
			data: {
				id: `${suffix}-unverified`,
				name: "Unverified",
				email: `unverified.${suffix}@example.test`,
				emailVerified: false,
			},
			select: { id: true },
		});

		expect(
			await ensureWorkspaceMembershipForVerifiedSession({
				userId: unverified.id,
			}),
		).toBeUndefined();
		expect(await roleOf(unverified.id)).toBeNull();
		await db.user.delete({ where: { id: unverified.id } });

		const forged = await db.user.create({
			data: {
				id: `${suffix}-forged`,
				name: "Forged",
				email: `forged.${suffix}@mail.example.test`,
				emailVerified: true,
			},
			select: { id: true },
		});
		expect(await ensureWorkspaceMembership(forged.id)).toBeUndefined();
		expect(await roleOf(forged.id)).toBeNull();
		await db.user.delete({ where: { id: forged.id } });
	});

	it("atomically gives Mihai the pending member role once", async () => {
		await ensureWorkspaceMembership(firstId);
		const mihai = await db.user.create({
			data: {
				id: `${suffix}-mihai`,
				name: "Mihai",
				email: "mihai@goodsmartidea.com",
				emailVerified: true,
			},
			select: { id: true },
		});

		const results = await Promise.all(
			Array.from({ length: 4 }, () => ensureWorkspaceMembership(mihai.id)),
		);

		expect(results).toEqual(Array(4).fill(WORKSPACE_ID));
		expect(await roleOf(mihai.id)).toBe("member");
		expect(await roleOf(firstId)).toBe("owner");
		expect(
			await db.member.count({
				where: { organizationId: WORKSPACE_ID, userId: mihai.id },
			}),
		).toBe(1);
		expect(
			await db.workspacePreauthorization.findUnique({
				where: {
					organizationId_email: {
						organizationId: WORKSPACE_ID,
						email: "mihai@goodsmartidea.com",
					},
				},
			}),
		).toBeNull();
		await db.user.delete({ where: { id: mihai.id } });
	});
});
