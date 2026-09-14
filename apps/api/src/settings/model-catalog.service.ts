import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { z } from "zod";

const CATALOG_TTL_MS = 30 * 60_000;
const CATALOG_KEY = "settings:model-catalog";
const CATALOG_TIMEOUT_MS = 5_000;

const GOVERNED_SOURCES = [
	"ada-ollama",
	"openrouter",
	"opencode",
	"hugging-face",
	"max-plan-proxy",
] as const;

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
	source: string | null;
}

const rate = z
	.union([z.number(), z.string()])
	.transform(Number)
	.refine(Number.isFinite)
	.nullable()
	.catch(null);
const catalogModel = z.object({
	id: z.string().trim().min(1),
	name: z.string().catch(""),
	provider: z.string().catch(""),
	owned_by: z.string().catch(""),
	type: z.string().catch("language"),
	tags: z.array(z.string()).catch([]),
	context_window: z.number().positive().catch(128_000),
	contextWindowTokens: z.number().positive().optional(),
	pricing: z.object({ input: rate, output: rate }).nullable().catch(null),
	source: z.enum(GOVERNED_SOURCES).nullable().catch(null),
});

const catalogResponse = z
	.object({
		data: z.array(z.unknown()).catch([]),
		models: z.array(z.unknown()).catch([]),
	})
	.catch({ data: [], models: [] });

function usable(model: z.infer<typeof catalogModel>): boolean {
	return (
		model.type === "language" &&
		model.tags.includes("tool-use") &&
		model.source !== null
	);
}

function toCatalogModel(model: z.infer<typeof catalogModel>): CatalogModel {
	const input = model.pricing?.input ?? null;
	const output = model.pricing?.output ?? null;
	return {
		id: model.id,
		name: model.name || model.id,
		provider: model.provider || model.owned_by || "managed",
		contextWindowTokens: model.contextWindowTokens ?? model.context_window,
		pricing: input !== null && output !== null ? { input, output } : null,
		source: model.source,
	};
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async models(): Promise<CatalogModel[] | null> {
		const cached = await this.cache.get<CatalogModel[]>(CATALOG_KEY);
		if (cached) return cached;
		const models = await this.fetchCatalog();
		if (!models) return null;
		await this.cache.set(CATALOG_KEY, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		return (await this.models())?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(): Promise<CatalogModel[] | null> {
		const url = process.env.GSI_MODEL_CATALOG_URL?.trim();
		if (!url) return null;
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});
			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					status: response.status,
				});
				return null;
			}
			const body = catalogResponse.parse(await response.json());
			const models = [...body.data, ...body.models].flatMap((entry) => {
				const parsed = catalogModel.safeParse(entry);
				return parsed.success && usable(parsed.data)
					? [toCatalogModel(parsed.data)]
					: [];
			});
			models.sort(
				(a, b) =>
					a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
			);
			this.logger.log({
				message: "Model catalog loaded",
				models: models.length,
			});
			return models;
		} catch (error) {
			this.logger.warn({
				message: "Model catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
