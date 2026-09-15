import { isTrustedOrigin } from "@crm/auth";
import { ForbiddenException, Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	memberListInput,
	memberListOutput,
	preauthorizationIdInput,
	preauthorizeMemberInput,
	setMemberRoleInput,
	updateWorkspaceInput,
	workspaceMemberOutput,
	workspaceOutput,
	workspacePreauthorizationOutput,
} from "./workspace.contracts";
import { WorkspaceService } from "./workspace.service";

function assertWorkspaceMutationOrigin(origin: string | undefined): void {
	const parsed = z.string().safeParse(origin);
	if (!parsed.success || !isTrustedOrigin(parsed.data)) {
		throw new ForbiddenException("The request origin is not trusted.");
	}
}

function assertMutationOrigin(ctx: AuthedTrpcContext): void {
	const origin = ctx.req?.headers.origin;
	assertWorkspaceMutationOrigin(origin);
}

@Router({ alias: "workspace" })
@UseMiddlewares(AuthMiddleware)
export class WorkspaceRouter {
	constructor(
		@Inject(WorkspaceService) private readonly workspace: WorkspaceService,
	) {}

	@Query({
		output: workspaceOutput,
		meta: restMeta("GET", "/workspace", ["Workspace"]),
	})
	async get(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.get(ctx.user.id);
	}

	@Query({
		input: memberListInput,
		output: memberListOutput,
		meta: restMeta("POST", "/workspace/members/search", ["Workspace"]),
	})
	async members(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof memberListInput>,
	) {
		return this.workspace.members(ctx.user.id, input);
	}

	@Query({
		output: z.array(workspacePreauthorizationOutput),
		meta: restMeta("GET", "/workspace/preauthorizations", ["Workspace"]),
	})
	async preauthorizations(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.preauthorizations(ctx.user.id);
	}

	@Mutation({
		input: updateWorkspaceInput,
		output: workspaceOutput,
		meta: restMeta("PATCH", "/workspace", ["Workspace"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWorkspaceInput>,
	) {
		assertMutationOrigin(ctx);
		return this.workspace.update(ctx.user.id, input);
	}

	@Mutation({
		input: setMemberRoleInput,
		output: workspaceMemberOutput,
		meta: restMeta("PATCH", "/workspace/members/{memberId}/role", [
			"Workspace",
		]),
	})
	async setMemberRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMemberRoleInput>,
	) {
		assertMutationOrigin(ctx);
		return this.workspace.setMemberRole(ctx.user.id, input);
	}

	@Mutation({
		input: preauthorizeMemberInput,
		output: workspacePreauthorizationOutput,
		meta: restMeta("POST", "/workspace/preauthorizations", ["Workspace"]),
	})
	async preauthorize(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof preauthorizeMemberInput>,
	) {
		assertMutationOrigin(ctx);
		return this.workspace.preauthorize(ctx.user.id, input);
	}

	@Mutation({
		input: preauthorizationIdInput,
		output: z.object({ id: z.string() }),
		meta: restMeta("DELETE", "/workspace/preauthorizations/{id}", [
			"Workspace",
		]),
	})
	async revokePreauthorization(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		assertMutationOrigin(ctx);
		return this.workspace.revokePreauthorization(ctx.user.id, id);
	}
}
