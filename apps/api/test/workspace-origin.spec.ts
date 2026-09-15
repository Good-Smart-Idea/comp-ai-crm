import { describe, expect, it } from "bun:test";
import { ForbiddenException } from "@nestjs/common";
import type { AuthedTrpcContext } from "../src/trpc/context.types";
import { WorkspaceRouter } from "../src/workspace/workspace.router";
import type { WorkspaceService } from "../src/workspace/workspace.service";

type Calls = {
	update: number;
	setMemberRole: number;
	preauthorize: number;
	revokePreauthorization: number;
};

function context(origin: string | undefined): AuthedTrpcContext {
	return {
		req: { headers: origin ? { origin } : {} } as AuthedTrpcContext["req"],
		session: null,
		user: { id: "workspace-origin-viewer" } as AuthedTrpcContext["user"],
	};
}

function router() {
	const calls: Calls = {
		update: 0,
		setMemberRole: 0,
		preauthorize: 0,
		revokePreauthorization: 0,
	};
	const service = {
		update: async () => {
			calls.update += 1;
		},
		setMemberRole: async () => {
			calls.setMemberRole += 1;
		},
		preauthorize: async () => {
			calls.preauthorize += 1;
		},
		revokePreauthorization: async () => {
			calls.revokePreauthorization += 1;
		},
	} as unknown as WorkspaceService;

	return { calls, router: new WorkspaceRouter(service) };
}

describe("workspace mutation origin", () => {
	it("accepts the configured origin for every mutation", async () => {
		const instance = router();
		const ctx = context("http://localhost:3000");

		await instance.router.update(ctx, {
			name: "CRM",
			website: "example.test",
		});
		await instance.router.setMemberRole(ctx, {
			memberId: "workspace-origin-member",
			role: "member",
		});
		await instance.router.preauthorize(ctx, {
			email: "person@example.test",
			role: "member",
		});
		await instance.router.revokePreauthorization(
			ctx,
			"workspace-origin-preauthorization",
		);

		expect(instance.calls).toEqual({
			update: 1,
			setMemberRole: 1,
			preauthorize: 1,
			revokePreauthorization: 1,
		});
	});

	for (const [label, origin] of [
		["missing", undefined],
		["untrusted", "https://attacker.example"],
	] as const) {
		it(`refuses a ${label} origin for every mutation`, async () => {
			const instance = router();
			const ctx = context(origin);

			await expect(
				instance.router.update(ctx, {
					name: "CRM",
					website: "example.test",
				}),
			).rejects.toThrow(ForbiddenException);
			await expect(
				instance.router.setMemberRole(ctx, {
					memberId: "workspace-origin-member",
					role: "member",
				}),
			).rejects.toThrow(ForbiddenException);
			await expect(
				instance.router.preauthorize(ctx, {
					email: "person@example.test",
					role: "member",
				}),
			).rejects.toThrow(ForbiddenException);
			await expect(
				instance.router.revokePreauthorization(
					ctx,
					"workspace-origin-preauthorization",
				),
			).rejects.toThrow(ForbiddenException);

			expect(instance.calls).toEqual({
				update: 0,
				setMemberRole: 0,
				preauthorize: 0,
				revokePreauthorization: 0,
			});
		});
	}
});
