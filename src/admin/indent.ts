/** Pure Tab / Shift+Tab editing logic behind CodeEditor (unit-tested in node). */

export const INDENT = "  ";

export interface TextEdit {
	value: string;
	start: number;
	end: number;
}

function lineStartAt(value: string, pos: number): number {
	return value.lastIndexOf("\n", pos - 1) + 1;
}

/**
 * Tab: with a caret, insert two spaces; with a selection, indent every line it touches.
 * Shift+Tab (`outdent`): remove up to two leading spaces from every touched line.
 * A multi-line selection ending at column 0 does not touch that last line.
 */
export function indentText(value: string, start: number, end: number, outdent = false): TextEdit {
	if (!outdent && start === end) {
		return { value: value.slice(0, start) + INDENT + value.slice(end), start: start + INDENT.length, end: start + INDENT.length };
	}

	const firstLine = lineStartAt(value, start);
	let lastPos = end;
	if (end > start && end > firstLine && lineStartAt(value, end) === end) lastPos = end - 1;

	// Start offsets of every touched line.
	const lineStarts: number[] = [firstLine];
	for (let i = value.indexOf("\n", firstLine); i !== -1 && i < lastPos; i = value.indexOf("\n", i + 1)) {
		lineStarts.push(i + 1);
	}

	let out = "";
	let cursor = 0;
	let newStart = start;
	let newEnd = end;
	for (const ls of lineStarts) {
		out += value.slice(cursor, ls);
		cursor = ls;
		if (outdent) {
			let n = 0;
			while (n < INDENT.length && value[ls + n] === " ") n++;
			cursor = ls + n;
			if (start > ls) newStart -= Math.min(n, start - ls);
			if (end > ls) newEnd -= Math.min(n, end - ls);
		} else {
			out += INDENT;
			if (start > ls) newStart += INDENT.length;
			if (end > ls) newEnd += INDENT.length;
		}
	}
	out += value.slice(cursor);
	return { value: out, start: newStart, end: newEnd };
}
