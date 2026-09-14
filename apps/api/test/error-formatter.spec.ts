import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { setAgentModelInput } from "../src/settings/settings.contracts";
import { readableInputError } from "../src/trpc/error-formatter";

const causeOf = (schema: z.ZodType, value: z.core.util.JSONType) => {
	const result = schema.safeParse(value);
	if (result.success) throw new Error("expected the parse to fail");
	return result.error;
};

describe("what a rejected form says", () => {
	it("shows the sentence, not the ZodError", () => {
		const cause = causeOf(setAgentModelInput, { modelId: "" });
		expect(readableInputError("ignored", cause)).toContain("characters");
	});

	it("never leaks the machinery a reader cannot act on", () => {
		const shown =
			readableInputError(
				"ignored",
				causeOf(setAgentModelInput, { modelId: "" }),
			) ?? "";
		for (const noise of [
			"too_small",
			"minimum",
			"inclusive",
			"path",
			"[",
			"{",
		]) {
			expect(shown).not.toContain(noise);
		}
	});

	it("names the field when zod's own default says nothing", () => {
		expect(
			readableInputError(
				"ignored",
				causeOf(z.object({ website: z.string() }), {}),
			),
		).toContain("website");
	});
});
