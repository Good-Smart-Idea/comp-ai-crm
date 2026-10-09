import { expect, it } from "bun:test";
import { parseCatalog } from "../src/settings/model-catalog.service";

it("reads native OpenRouter context and per-token prices without admitting models that lack tools", () => {
	const model = {
		id: "z-ai/glm-5.3-flash",
		name: "Z.ai: GLM 5.3 Flash",
		context_length: 1_048_576,
		pricing: { prompt: "0.00000015", completion: "0.0000005" },
		supported_parameters: ["tools", "reasoning"],
	};
	const parsed = parseCatalog({
		data: [
			model,
			{ ...model, id: "no-tools", supported_parameters: ["temperature"] },
		],
	});
	expect(parsed).toEqual([
		{
			id: model.id,
			name: model.name,
			provider: "OpenRouter",
			contextWindowTokens: 1_048_576,
			pricing: { input: 0.15, output: 0.5 },
			source: "OpenRouter",
		},
	]);
});
