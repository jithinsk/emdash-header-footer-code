import { cn } from "@cloudflare/kumo";
import * as React from "react";
import { type ChipKind, addChips, validateChip } from "./chips.js";
import { XIcon } from "./icons.js";

/**
 * Tag-style list input: type and press Enter (or a comma) to add, Backspace on an empty input
 * removes the last chip, × removes one. Invalid values stay in the input and the reason is
 * reported through `onErrorChange` (the form shows it under the field).
 */
export function ChipInput({
	id,
	kind,
	value,
	onChange,
	onErrorChange,
	invalid,
	describedBy,
	label,
	placeholder,
}: {
	id: string;
	kind: ChipKind;
	value: string[];
	onChange: (value: string[]) => void;
	onErrorChange: (error: string | null) => void;
	invalid?: boolean;
	describedBy?: string;
	label: string;
	placeholder?: string;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [text, setText] = React.useState("");
	// After a rejected add, re-validate as the user edits so the message clears once fixed.
	const [liveCheck, setLiveCheck] = React.useState(false);

	function commit(raw: string) {
		const r = addChips(value, raw, kind);
		if (r.chips.length !== value.length) onChange(r.chips);
		setText(r.rest);
		setLiveCheck(r.error !== null);
		onErrorChange(r.error);
	}

	function onTextChange(next: string) {
		if (/[,\n]/.test(next)) {
			commit(next);
			return;
		}
		setText(next);
		if (liveCheck) {
			const t = next.trim();
			const err = t === "" ? null : validateChip(t, kind);
			onErrorChange(err);
			if (err === null) setLiveCheck(false);
		}
	}

	function remove(index: number) {
		onChange(value.filter((_, i) => i !== index));
		inputRef.current?.focus();
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			commit(text);
		} else if (e.key === "Backspace" && text === "" && value.length > 0) {
			e.preventDefault();
			remove(value.length - 1);
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: clicking the padding focuses the real input
		<div
			className={cn(
				"flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg bg-kumo-base px-2 py-1.5 ring ring-kumo-line focus-within:ring-kumo-focus/50",
				invalid && "!ring-kumo-danger",
			)}
			onClick={(e) => {
				if (e.target === e.currentTarget) inputRef.current?.focus();
			}}
		>
			{value.map((chip, i) => (
				<span
					key={chip}
					data-testid={`${id}-chip`}
					className="inline-flex max-w-full items-center gap-1 rounded-md bg-kumo-tint py-0.5 ps-2 pr-1 font-mono text-sm text-kumo-default"
				>
					<span className="truncate">{chip}</span>
					<button
						type="button"
						className="inline-flex cursor-pointer items-center rounded p-0.5 text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default"
						aria-label={`Remove ${chip}`}
						onClick={() => remove(i)}
					>
						<XIcon size={12} />
					</button>
				</span>
			))}
			<input
				ref={inputRef}
				id={id}
				data-testid={id}
				aria-label={label}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-kumo-default outline-none"
				value={text}
				placeholder={value.length === 0 ? placeholder : undefined}
				onChange={(e) => onTextChange(e.target.value)}
				onKeyDown={onKeyDown}
				onBlur={() => {
					if (text.trim() !== "") commit(text);
				}}
				spellCheck={false}
				autoCapitalize="off"
				autoComplete="off"
			/>
		</div>
	);
}
