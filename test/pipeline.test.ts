import { describe, expect, it } from "vitest";
import { prepareSnippets } from "../src/core/match.js";
import { renderFragments } from "../src/core/pipeline.js";
import type { Transform } from "../src/core/types.js";
import { makeLogger, makePage, makeSnippet } from "./fakes.js";

function run(snippets: ReturnType<typeof makeSnippet>[], transforms: Transform[] = [], page = makePage()) {
	const log = makeLogger();
	const out = renderFragments(prepareSnippets(snippets, log), page, transforms, log);
	return { out, log };
}

describe("renderFragments", () => {
	it("emits one html fragment per matching snippet with key hfc-<id>", () => {
		const s = makeSnippet({ placement: "body:end", code: "<script>x()</script>" });
		const { out } = run([s]);
		expect(out).toEqual([
			{ kind: "html", placement: "body:end", html: "<script>x()</script>", key: `hfc-${s.id}` },
		]);
	});

	it("keeps priority order within a placement", () => {
		const late = makeSnippet({ priority: 50, code: "late" });
		const early = makeSnippet({ priority: 1, code: "early" });
		const { out } = run([late, early]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["early", "late"]);
	});

	it("skips non-matching snippets", () => {
		const { out } = run([makeSnippet({ includePaths: ["/blog/*"] })], [], makePage({ path: "/about" }));
		expect(out).toEqual([]);
	});

	it("applies a rewriting transform", () => {
		const t: Transform = ({ html }) => html.replace("a", "b");
		const { out } = run([makeSnippet({ code: "a" })], [t]);
		expect(out[0]).toMatchObject({ html: "b" });
	});

	it("chains transforms in order and passes snippet and page", () => {
		const seen: string[] = [];
		const t1: Transform = ({ html, snippet, page }) => {
			seen.push(`${snippet.name}@${page.path}`);
			return `${html}1`;
		};
		const t2: Transform = ({ html }) => `${html}2`;
		const s = makeSnippet({ code: "x", name: "N" });
		const { out } = run([s], [t1, t2], makePage({ path: "/p" }));
		expect(out[0]).toMatchObject({ html: "x12" });
		expect(seen).toEqual(["N@/p"]);
	});

	it("a transform returning null skips only that snippet", () => {
		const skip = makeSnippet({ code: "skip" });
		const keep = makeSnippet({ code: "keep" });
		const t: Transform = ({ html }) => (html === "skip" ? null : html);
		const { out } = run([skip, keep], [t]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["keep"]);
	});

	it("a throwing transform is logged; that snippet is skipped, others render", () => {
		const bad = makeSnippet({ code: "bad" });
		const good = makeSnippet({ code: "good" });
		const t: Transform = ({ html }) => {
			if (html === "bad") throw new Error("boom");
			return html;
		};
		const { out, log } = run([bad, good], [t]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["good"]);
		expect(log.errors).toHaveLength(1);
		expect(JSON.stringify(log.errors[0])).toContain(bad.id);
		expect(JSON.stringify(log.errors[0])).toContain("boom");
	});

	it("object results: html plus extra fragments, deduped by key", () => {
		const loader = { kind: "external-script" as const, placement: "head" as const, src: "/l.js", key: "loader" };
		const t: Transform = ({ html }) => ({ html, fragments: [loader] });
		const a = makeSnippet({ code: "a" });
		const b = makeSnippet({ code: "b" });
		const { out } = run([a, b], [t]);
		expect(out).toEqual([
			{ kind: "html", placement: "head", html: "a", key: `hfc-${a.id}` },
			{ kind: "html", placement: "head", html: "b", key: `hfc-${b.id}` },
			loader,
		]);
	});

	it("object result with html null skips the snippet but keeps its fragments", () => {
		const extra = { kind: "html" as const, placement: "body:end" as const, html: "<i></i>", key: "x" };
		const t: Transform = () => ({ html: null, fragments: [extra] });
		const { out } = run([makeSnippet()], [t]);
		expect(out).toEqual([extra]);
	});

	it("fragments from an earlier transform are kept when a later transform drops or throws", () => {
		const extra = { kind: "html" as const, placement: "head" as const, html: "<link>", key: "loader" };
		const adds: Transform = ({ html }) => ({ html, fragments: [extra] });
		const drops: Transform = () => null;
		const throws: Transform = () => {
			throw new Error("boom");
		};
		expect(run([makeSnippet()], [adds, drops]).out).toEqual([extra]);
		expect(run([makeSnippet()], [adds, throws]).out).toEqual([extra]);
	});

	it("keyless extra fragments are all kept", () => {
		const f = { kind: "html" as const, placement: "head" as const, html: "<b></b>" };
		const t: Transform = ({ html }) => ({ html, fragments: [f] });
		const { out } = run([makeSnippet(), makeSnippet()], [t]);
		expect(out.filter((x) => x === f)).toHaveLength(2);
	});
});
