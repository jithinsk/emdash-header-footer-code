import { cn } from "@cloudflare/kumo";
import * as React from "react";
import { indentText } from "./indent.js";

/**
 * Code textarea with a line-number gutter and Tab/Shift+Tab indenting. No editor dependency:
 * the gutter is a <pre> kept in step with the textarea's scroll position. Press Esc, then Tab,
 * to move focus out of the editor with the keyboard.
 */
export function CodeEditor({
	id,
	value,
	onChange,
	invalid,
	describedBy,
	label,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	invalid?: boolean;
	describedBy?: string;
	label: string;
}) {
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const gutterRef = React.useRef<HTMLPreElement>(null);
	const tabEscape = React.useRef(false);
	const pendingSelection = React.useRef<[number, number] | null>(null);

	const lineCount = React.useMemo(() => {
		let n = 1;
		for (let i = value.indexOf("\n"); i !== -1; i = value.indexOf("\n", i + 1)) n++;
		return n;
	}, [value]);
	const numbers = React.useMemo(
		() => Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n"),
		[lineCount],
	);

	const syncScroll = React.useCallback(() => {
		if (gutterRef.current && textareaRef.current) gutterRef.current.scrollTop = textareaRef.current.scrollTop;
	}, []);

	// Restore the selection after a fallback (non-execCommand) indent re-render, and keep the
	// gutter aligned when the content height changes.
	React.useLayoutEffect(() => {
		const ta = textareaRef.current;
		if (ta && pendingSelection.current) {
			ta.setSelectionRange(...pendingSelection.current);
			pendingSelection.current = null;
		}
		syncScroll();
	}, [value, syncScroll]);

	function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		// Modifier-only presses (e.g. Shift before Shift+Tab) must not cancel a pending Esc.
		if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
		if (e.key === "Escape") {
			tabEscape.current = true;
			return;
		}
		if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) {
			tabEscape.current = false;
			return;
		}
		if (tabEscape.current) {
			tabEscape.current = false;
			return; // let focus move on
		}
		e.preventDefault();
		const ta = e.currentTarget;
		const old = ta.value;
		const edit = indentText(old, ta.selectionStart, ta.selectionEnd, e.shiftKey);
		if (edit.value === old) return;

		// Replace only the changed span so the browser's undo history keeps working.
		let a = 0;
		while (a < old.length && a < edit.value.length && old[a] === edit.value[a]) a++;
		let b = 0;
		while (
			b < old.length - a &&
			b < edit.value.length - a &&
			old[old.length - 1 - b] === edit.value[edit.value.length - 1 - b]
		)
			b++;
		const inserted = edit.value.slice(a, edit.value.length - b);
		ta.setSelectionRange(a, old.length - b);
		const ok =
			typeof document.execCommand === "function" &&
			document.execCommand(inserted === "" ? "delete" : "insertText", false, inserted);
		if (ok && ta.value === edit.value) {
			ta.setSelectionRange(edit.start, edit.end);
		} else {
			pendingSelection.current = [edit.start, edit.end];
			onChange(edit.value);
		}
	}

	return (
		<div
			className={cn(
				"flex overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-line focus-within:ring-kumo-focus/50",
				invalid && "!ring-kumo-danger",
			)}
		>
			<pre
				ref={gutterRef}
				aria-hidden="true"
				className="hfc-code-text m-0 shrink-0 select-none overflow-hidden border-e border-kumo-line bg-kumo-elevated px-3 py-3 text-end font-mono text-kumo-subtle"
			>
				{numbers}
				{"\n\n\n"}
			</pre>
			<textarea
				ref={textareaRef}
				id={id}
				data-testid={id}
				aria-label={label}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onKeyDown}
				onScroll={syncScroll}
				spellCheck={false}
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				wrap="off"
				placeholder={"<script>\n  // your code\n</script>"}
				className="hfc-code-text hfc-code-area min-w-0 flex-1 resize-y bg-transparent px-3 py-3 font-mono text-kumo-default outline-none"
			/>
		</div>
	);
}
