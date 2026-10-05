import { describe, expect, it } from "vitest";
import { headerFooterCode } from "../src/index.js";
import { createPlugin } from "../src/plugin.js";

describe("descriptor", () => {
	it("returns a native descriptor with matching id and version", () => {
		expect(headerFooterCode()).toEqual({
			id: "header-footer-code",
			version: "0.1.0",
			format: "native",
			entrypoint: "emdash-header-footer-code/plugin",
			options: {},
			adminEntry: "emdash-header-footer-code/admin",
			adminPages: [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }],
		});
	});
	it("accepts an entrypoint override and strips it from options", () => {
		const d = headerFooterCode({ entrypoint: "my-wrapper/plugin" });
		expect(d.entrypoint).toBe("my-wrapper/plugin");
		expect(d.options).toEqual({});
		expect(d.adminEntry).toBe("emdash-header-footer-code/admin");
	});
	it("options are JSON-serialisable", () => {
		const d = headerFooterCode();
		expect(JSON.parse(JSON.stringify(d.options))).toEqual(d.options);
	});
});

describe("createPlugin", () => {
	const plugin = createPlugin();
	it("declares exactly the page-fragments capability", () => {
		expect(plugin.capabilities).toEqual(["hooks.page-fragments:register"]);
	});
	it("matches descriptor id/version", () => {
		expect(plugin.id).toBe("header-footer-code");
		expect(plugin.version).toBe("0.1.0");
	});
	it("registers the page:fragments hook", () => {
		expect(typeof plugin.hooks["page:fragments"]?.handler).toBe("function");
	});
	it("declares storage collections with indexes", () => {
		expect(plugin.storage).toEqual({
			snippets: { indexes: ["createdAt"] },
			changelog: { indexes: ["at"] },
		});
	});
	it("declares the admin page", () => {
		expect(plugin.admin.entry).toBe("emdash-header-footer-code/admin");
		expect(plugin.admin.pages).toEqual([{ path: "/snippets", label: "Header & Footer Code", icon: "code" }]);
	});
});
