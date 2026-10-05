import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import { FIELDS, type FieldDef, getFieldValue, setFieldValue } from "../core/fields.js";
import type { EditableSnippet } from "../core/types.js";
import { validateSnippetInput } from "../core/validate.js";
import { ApiError, api } from "./api.js";

type Draft = EditableSnippet & { id?: string };

const inputClass = "w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm";

function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
	const id = `hfc-field-${field.name}`;
	switch (field.type) {
		case "text":
			return <input id={id} data-testid={id} className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
		case "number":
			return (
				<input
					id={id}
					data-testid={id}
					type="number"
					step={1}
					className={inputClass}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
				/>
			);
		case "code":
			return (
				<textarea
					id={id}
					data-testid={id}
					className={`${inputClass} font-mono min-h-64`}
					spellCheck={false}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case "select":
			return (
				<select id={id} data-testid={id} className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
					{field.options?.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		case "toggle":
			return <Switch data-testid={id} checked={Boolean(value)} onCheckedChange={onChange} label={field.label} />;
		case "pathList":
		case "localeList":
			return (
				<textarea
					id={id}
					data-testid={id}
					className={`${inputClass} font-mono min-h-20`}
					value={Array.isArray(value) ? value.join("\n") : ""}
					onChange={(e) => onChange(e.target.value.split("\n"))}
				/>
			);
	}
}

export function SnippetForm({ initial, onDone }: { initial: Draft; onDone: (saved: boolean) => void }) {
	const [draft, setDraft] = React.useState<Draft>(initial);
	const [errors, setErrors] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState(false);

	async function save() {
		const local = validateSnippetInput(draft);
		if (!local.ok) {
			setErrors(local.errors);
			return;
		}
		setSaving(true);
		try {
			await api.save({ ...local.value, meta: draft.meta, id: draft.id });
			onDone(true);
		} catch (e) {
			setErrors(e instanceof ApiError ? { _form: e.message, ...e.fieldErrors } : { _form: String(e) });
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">{draft.id ? "Edit snippet" : "New snippet"}</h2>
			{errors._form && errors._form !== "Validation failed" && (
				<p data-testid="hfc-error-_form" className="text-kumo-danger text-sm">{errors._form}</p>
			)}
			{FIELDS.map((field) => (
				<div key={field.name} className="space-y-1">
					{field.type !== "toggle" && (
						<label htmlFor={`hfc-field-${field.name}`} className="block text-sm font-medium">
							{field.label}
							{field.required && " *"}
						</label>
					)}
					<FieldInput
						field={field}
						value={getFieldValue(draft as unknown as Record<string, unknown>, field.name)}
						onChange={(v) => setDraft((d) => setFieldValue(d as unknown as Record<string, unknown>, field.name, v) as unknown as Draft)}
					/>
					{field.help && <p className="text-xs text-kumo-subtle">{field.help}</p>}
					{errors[field.name] && (
						<p data-testid={`hfc-error-${field.name}`} className="text-kumo-danger text-sm">{errors[field.name]}</p>
					)}
				</div>
			))}
			<div className="flex gap-2">
				<button data-testid="hfc-save" type="button" disabled={saving} onClick={save} className="rounded-md bg-kumo-brand px-4 py-2 text-sm text-white">
					{saving ? "Saving…" : "Save"}
				</button>
				<button data-testid="hfc-cancel" type="button" onClick={() => onDone(false)} className="rounded-md border border-kumo-line px-4 py-2 text-sm">
					Cancel
				</button>
			</div>
		</div>
	);
}
