import { describe, expect, it } from "bun:test";
import {
	parseLinkedInCompanyResult,
	parseLinkedInPersonResult,
} from "../agent/lib/bd-client";

describe("Bright Data SDK response parsing", () => {
	it("parses company arrays", () => {
		expect(
			parseLinkedInCompanyResult([
				{ name: "Acme", website: "https://acme.example" },
			]),
		).toEqual({ name: "Acme", website: "https://acme.example" });
	});

	it("parses person JSON strings", () => {
		expect(
			parseLinkedInPersonResult(
				JSON.stringify([{ name: "Ada Lovelace", city: "London" }]),
			),
		).toEqual({ name: "Ada Lovelace", city: "London" });
	});

	it("rejects malformed SDK records", () => {
		expect(parseLinkedInPersonResult([{ name: 42 }])).toBeNull();
		expect(parseLinkedInCompanyResult("not-json")).toBeNull();
		expect(parseLinkedInCompanyResult({ name: "Acme" })).toBeNull();
	});
});
