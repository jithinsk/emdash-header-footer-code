import { describe, expect, it } from "vitest";
import { indentText } from "../src/admin/indent.js";

/** Build an edit from a string with `|` marking the selection start/end (one `|` = caret). */
function sel(marked: string) {
	const a = marked.indexOf("|");
	const b = marked.indexOf("|", a + 1);
	const value = marked.replace(/\|/g, "");
	return b === -1 ? { value, start: a, end: a } : { value, start: a, end: b - 1 };
}
function mark(r: { value: string; start: number; end: number }) {
	if (r.start === r.end) return `${r.value.slice(0, r.start)}|${r.value.slice(r.start)}`;
	return `${r.value.slice(0, r.start)}|${r.value.slice(r.start, r.end)}|${r.value.slice(r.end)}`;
}
const run = (marked: string, outdent = false) => {
	const s = sel(marked);
	return mark(indentText(s.value, s.start, s.end, outdent));
};

describe("indentText", () => {
	it("inserts two spaces at the caret", () => {
		expect(run("ab|cd")).toBe("ab  |cd");
	});
	it("replaces nothing when a selection is within one line: indents that line", () => {
		expect(run("<a>|x|</a>")).toBe("  <a>|x|</a>");
	});
	it("indents every line a multi-line selection touches", () => {
		expect(run("a\nb|b\ncc|c\nd")).toBe("a\n  b|b\n  cc|c\nd");
	});
	it("does not indent a line where the selection ends at column 0", () => {
		expect(run("|a\nb\n|c")).toBe("|  a\n  b\n|c");
	});
	it("outdents the caret line by up to two spaces", () => {
		expect(run("    a|b", true)).toBe("  a|b");
		expect(run(" a|b", true)).toBe("a|b");
		expect(run("a|b", true)).toBe("a|b");
	});
	it("outdents every selected line, keeping the selection on the same text", () => {
		expect(run("  a\n  |b\n    c|\nd", true)).toBe("  a\n|b\n  c|\nd");
	});
	it("keeps the caret at the line start when outdenting from inside the indent", () => {
		expect(run(" | a", true)).toBe("|a");
	});
});
