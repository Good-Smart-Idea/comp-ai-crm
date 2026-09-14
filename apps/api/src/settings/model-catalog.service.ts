import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { z } from "zod";

const CATALOG_TTL_MS = 30 * 60_000;
const CATALOG_KEY = "settings:model-catalog";
const CATALOG_TIMEOUT_MS = 5_000;

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
	tags: z.array(z.string()).optional(),
	context_window: z.number().positive().catch(128_000),
	contextWindowTokens: z.number().positive().optional(),
	pricing: z.object({ input: rate, output: rate }).nullable().catch(null),
	source: z.string().trim().min(1).nullable().catch(null),
});

const catalogResponse = z.union([
	z.object({ data: z.array(z.unknown()) }),
	z.object({ models: z.array(z.unknown()) }),
	z.array(z.unknown()),
]);

export function parseCatalog(value: unknown): CatalogModel[] | null {
	const parsed = catalogResponse.safeParse(value);
	if (!parsed.success) return null;
	const entries = Array.isArray(parsed.data)
		? parsed.data
		: "data" in parsed.data
			? parsed.data.data
			: parsed.data.models;
	const models = entries.flatMap((entry) => {
		const model = catalogModel.safeParse(entry);
		if (!model.success || model.data.type !== "language") return [];
		if (model.data.tags && !model.data.tags.includes("tool-use")) return [];
		const input = model.data.pricing?.input ?? null;
		const output = model.data.pricing?.output ?? null;
		return [
			{
				id: model.data.id,
				name: model.data.name || model.data.id,
				provider: model.data.provider || model.data.owned_by || "managed",
				contextWindowTokens:
					model.data.contextWindowTokens ?? model.data.context_window,
				pricing: input !== null && output !== null ? { input, output } : null,
				source: model.data.source,
			},
		];
	});
	return [...new Map(models.map((model) => [model.id, model])).values()].sort(
		(a, b) =>
			a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
	);
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	configured(): boolean {
		return Boolean(
			this.endpoint() && process.env.GSI_MODEL_GATEWAY_API_KEY?.trim(),
		);
	}

	async models(): Promise<CatalogModel[] | null> {
		if (!this.configured()) return null;
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

	private endpoint(): string | null {
		const explicit = process.env.GSI_MODEL_CATALOG_URL?.trim();
		if (explicit) return explicit;
		const base = process.env.GSI_MODEL_GATEWAY_BASE_URL?.trim();
		return base ? `${base.replace(/\/+$/, "")}/models` : null;
	}

	private async fetchCatalog(): Promise<CatalogModel[] | null> {
		const url = this.endpoint();
		const key = process.env.GSI_MODEL_GATEWAY_API_KEY?.trim();
		if (!url || !key) return null;
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json", authorization: `Bearer ${key}` },
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});
			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					status: response.status,
				});
				return null;
			}
			const models = parseCatalog(await response.json());
			if (!models) {
				this.logger.warn({ message: "Model catalog response was invalid" });
				return null;
			}
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
