import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	readAgentModel,
	writeAgentModel,
} from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { selectedModel } from "../agent/lib/model";

async function clear() {
	await db.workspaceAgentModel.deleteMany({
		where: { workspaceId: WORKSPACE_ID },
	});
}

let saved: Prisma.WorkspaceAgentModelUncheckedCreateInput | null = null;

beforeAll(async () => {
	saved = await db.workspaceAgentModel.findUnique({
		where: { workspaceId: WORKSPACE_ID },
	});
});

async function ensureWorkspace() {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "Test Workspace",
			slug: "test",
			createdAt: new Date(),
		},
		update: {},
	});
}

beforeEach(async () => {
	await ensureWorkspace();
	await clear();
});
afterEach(clear);

afterAll(async () => {
	if (saved) await db.workspaceAgentModel.create({ data: saved });
});

describe("the configured model", () => {
	it("falls back when nothing has ever been chosen", async () => {
		const setting = await readAgentModel(db);
		expect(setting.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(setting.isDefault).toBe(true);
		expect(await selectedModel()).toBeNull();
	});

	it("returns the chosen model with its own context window", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		expect(await selectedModel()).toEqual({
			model: "anthropic/claude-sonnet-5",
			modelContextWindowTokens: 200_000,
		});
	});

	it("goes back to the fallback when the choice is cleared", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		await writeAgentModel(db, null);
		expect(await selectedModel()).toBeNull();
		expect((await readAgentModel(db)).isDefault).toBe(true);
	});

	it("keeps one workspace row rather than accumulating choices", async () => {
		await writeAgentModel(db, { id: "openai/gpt-5.5", contextWindowTokens: 1 });
		await writeAgentModel(db, { id: "zai/glm-5.2", contextWindowTokens: 2 });
		expect(await db.workspaceAgentModel.count()).toBe(1);
		expect((await readAgentModel(db)).id).toBe("zai/glm-5.2");
	});
});
