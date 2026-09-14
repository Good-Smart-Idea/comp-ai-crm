import { describe, expect, it } from "bun:test";
import { ForbiddenException } from "@nestjs/common";
import { assertWorkspaceMutationOrigin } from "../src/workspace/workspace.router";

describe("workspace mutation origin", () => {
	it("accepts the configured origin", () => {
		expect(() =>
			assertWorkspaceMutationOrigin("http://localhost:3000"),
		).not.toThrow();
	});

	it("refuses a missing or untrusted origin", () => {
		expect(() => assertWorkspaceMutationOrigin(undefined)).toThrow(
			ForbiddenException,
		);
		expect(() =>
			assertWorkspaceMutationOrigin("https://attacker.example"),
		).toThrow(ForbiddenException);
	});
});
