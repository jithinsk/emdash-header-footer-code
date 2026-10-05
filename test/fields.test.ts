import { describe, expect, it } from "vitest";
import { FIELDS, emptyDraft, getFieldValue, setFieldValue } from "../src/core/fields.js";

describe("FIELDS", () => {
	it("covers every editable field, in form order", () => {
		expect(FIELDS.map((f) => f.name)).toEqual([
			"name",
			"code",
			"placement",
			"enabled",
			"priority",
			"includePaths",
			"excludePaths",
			"pageKind",
			"locales",
		]);
	});
	it("marks code as manage-only and required", () => {
		const code = FIELDS.find((f) => f.name === "code")!;
		expect(code).toMatchObject({ type: "code", manageOnly: true, required: true });
	});
});

describe("get/setFieldValue", () => {
	it("reads and writes top-level fields immutably", () => {
		const d = emptyDraft();
		const d2 = setFieldValue(d, "name", "GA");
		expect(d.name).toBe("");
		expect(getFieldValue(d2, "name")).toBe("GA");
	});
	it("reads and writes dotted meta fields, preserving other meta keys", () => {
		const d = { ...emptyDraft(), meta: { keep: 1 } };
		const d2 = setFieldValue(d, "meta.consentCategory", "analytics");
		expect(d2.meta).toEqual({ keep: 1, consentCategory: "analytics" });
		expect(getFieldValue(d2, "meta.consentCategory")).toBe("analytics");
		expect(d.meta).toEqual({ keep: 1 });
	});
	it("returns undefined for missing nested paths", () => {
		expect(getFieldValue(emptyDraft(), "meta.nope")).toBeUndefined();
	});
});
