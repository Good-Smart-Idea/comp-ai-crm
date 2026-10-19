import { describe, expect, it } from "bun:test";
import { fieldFacetOptions } from "./field-facets";

const selectField = {
	type: "SELECT",
	options: [
		{ id: "opt_a", label: "Intake" },
		{ id: "opt_b", label: "Reached Out" },
		{ id: "opt_c", label: "Qualified" },
	],
};

const userField = {
	type: "USER",
	options: [],
};

const users = [
	{ id: "user_1", name: "Ada" },
	{ id: "user_2", name: "Grace" },
];

describe("fieldFacetOptions", () => {
	it("keeps every configured SELECT option at zero counts", () => {
		expect(fieldFacetOptions(selectField, users, {})).toEqual([
			{ value: "opt_a", label: "Intake" },
			{ value: "opt_b", label: "Reached Out" },
			{ value: "opt_c", label: "Qualified" },
		]);
	});

	it("keeps configured SELECT options without counts", () => {
		expect(fieldFacetOptions(selectField, users, undefined)).toHaveLength(3);
	});

	it("maps SELECT option ids to labels", () => {
		const options = fieldFacetOptions(selectField, users, {
			opt_a: 4,
			opt_c: 1,
		});
		expect(options.map((option) => option.value)).toEqual([
			"opt_a",
			"opt_b",
			"opt_c",
		]);
		expect(options.map((option) => option.label)).toContain("Reached Out");
	});

	it("filters USER options to counted users", () => {
		expect(fieldFacetOptions(userField, users, { user_2: 2 })).toEqual([
			{ value: "user_2", label: "Grace" },
		]);
	});

	it("drops all USER options when counts are missing", () => {
		expect(fieldFacetOptions(userField, users, undefined)).toEqual([]);
		expect(fieldFacetOptions(userField, undefined, undefined)).toEqual([]);
	});
});
