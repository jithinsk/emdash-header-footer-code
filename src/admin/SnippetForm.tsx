import { Banner, Button, Dialog, Input, Label, LayerCard, Select, Switch, cn } from "@cloudflare/kumo";
import * as React from "react";
import { FIELDS, type FieldDef, type FieldSection, getFieldValue, setFieldValue } from "../core/fields.js";
import type { EditableSnippet, Snippet } from "../core/types.js";
import { LIMITS, byteLength, checkLimits, formatKB, validateSnippetInput } from "../core/validate.js";
import { ApiError, api } from "./api.js";
import { ChipInput } from "./ChipInput.js";
import { CodeEditor } from "./CodeEditor.js";
import { ArrowLeftIcon } from "./icons.js";

export type Draft = EditableSnippet & { id?: string };

/** Keyboard help shown in the Code card header; the code textarea references it. */
const CODE_KEYS_ID = "hfc-code-keys";

const SECTION_TITLE: Record<Exclude<FieldSection, "main">, { title: string; description: string }> = {
	settings: { title: "Settings", description: "What this snippet is and where in the page it goes." },
	targeting: { title: "Targeting", description: "Which pages it renders on. Leave everything empty for every page." },
};

function fieldId(name: string) {
	return `hfc-field-${name}`;
}

function sameDraft(a: Draft, b: Draft) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function FieldShell({
	field,
	error,
	children,
	labelFor = true,
	hideLabel = false,
}: {
	field: FieldDef;
	error?: string;
	children: React.ReactNode;
	labelFor?: boolean;
	/** Visually hide the label (the code field's card already names it). */
	hideLabel?: boolean;
}) {
	const id = fieldId(field.name);
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={labelFor ? id : undefined} className={hideLabel ? "sr-only" : undefined}>
				{field.label}
			</Label>
			{children}
			{error && (
				<p id={`${id}-error`} data-testid={`hfc-error-${field.name}`} role="alert" className="text-sm text-kumo-danger">
					{error}
				</p>
			)}
			{field.help && (
				<p id={`${id}-help`} className="text-sm text-kumo-subtle">
					{field.help}
				</p>
			)}
		</div>
	);
}

function FieldControl({
	field,
	value,
	error,
	onChange,
	onChipError,
	onChipPending,
}: {
	field: FieldDef;
	value: unknown;
	error?: string;
	onChange: (v: unknown) => void;
	onChipError: (e: string | null) => void;
	onChipPending: (pending: boolean) => void;
}) {
	const id = fieldId(field.name);
	const describedBy =
		[field.type === "code" && CODE_KEYS_ID, field.help && `${id}-help`, error && `${id}-error`]
			.filter(Boolean)
			.join(" ") || undefined;
	const invalid = Boolean(error);
	switch (field.type) {
		case "text":
		case "number":
			return (
				<FieldShell field={field} error={error}>
					<Input
						id={id}
						data-testid={id}
						type={field.type === "number" ? "number" : "text"}
						step={field.type === "number" ? 1 : undefined}
						className={cn("w-full", invalid && "!ring-kumo-danger")}
						aria-invalid={invalid || undefined}
						aria-describedby={describedBy}
						value={String(value ?? "")}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							onChange(
								field.type === "number"
									? e.target.value === ""
										? ""
										: Number(e.target.value)
									: e.target.value,
							)
						}
					/>
				</FieldShell>
			);
		case "select":
			return (
				<FieldShell field={field} error={error} labelFor={false}>
					<div data-testid={id}>
						<Select
							aria-label={field.label}
							className={cn("w-full", invalid && "!ring-kumo-danger")}
							value={String(value ?? "")}
							onValueChange={(v) => onChange(v)}
							items={Object.fromEntries((field.options ?? []).map((o) => [o.value, o.label]))}
						/>
					</div>
				</FieldShell>
			);
		case "toggle":
			return (
				<div className="grid gap-1.5">
					<Switch
						id={id}
						data-testid={id}
						checked={Boolean(value)}
						onCheckedChange={onChange}
						label={field.label}
					/>
					{field.help && <p className="text-sm text-kumo-subtle">{field.help}</p>}
					{error && (
						<p data-testid={`hfc-error-${field.name}`} role="alert" className="text-sm text-kumo-danger">
							{error}
						</p>
					)}
				</div>
			);
		case "pathList":
		case "localeList":
			return (
				<FieldShell field={field} error={error}>
					<ChipInput
						id={id}
						kind={field.type === "pathList" ? "path" : "locale"}
						label={field.label}
						placeholder={field.type === "pathList" ? "/blog/*" : "en"}
						value={Array.isArray(value) ? (value as string[]) : []}
						onChange={onChange}
						onErrorChange={onChipError}
						onPendingChange={onChipPending}
						invalid={invalid}
						describedBy={describedBy}
					/>
				</FieldShell>
			);
		case "code":
			return (
				<FieldShell field={field} error={error} hideLabel={field.section === "main"}>
					<CodeEditor
						id={id}
						label={field.label}
						value={String(value ?? "")}
						onChange={onChange}
						invalid={invalid}
						describedBy={describedBy}
					/>
				</FieldShell>
			);
	}
}

function CardHeader({
	title,
	description,
	descriptionId,
	aside,
}: {
	title: string;
	description?: string;
	descriptionId?: string;
	aside?: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-kumo-line px-5 py-4">
			<div className="min-w-0">
				<h2 className="text-base font-semibold text-kumo-default">{title}</h2>
				{description && (
					<p id={descriptionId} className="text-sm text-kumo-subtle">
						{description}
					</p>
				)}
			</div>
			{aside}
		</div>
	);
}

export function SnippetForm({
	initial,
	onSaved,
	onClose,
}: {
	initial: Draft;
	onSaved: (snippet: Snippet) => void;
	onClose: () => void;
}) {
	const [draft, setDraft] = React.useState<Draft>(initial);
	const draftRef = React.useRef(draft);
	const [errors, setErrors] = React.useState<Record<string, string>>({});
	const [chipErrors, setChipErrors] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState(false);
	const [confirmDiscard, setConfirmDiscard] = React.useState(false);
	// Chip inputs holding text that has not been added yet (valid or not) count as unsaved edits.
	const [pendingChips, setPendingChips] = React.useState<Record<string, true>>({});

	const dirty = !sameDraft(draft, initial) || Object.keys(pendingChips).length > 0;
	const codeBytes = byteLength(draft.code);
	const overLimit = codeBytes > LIMITS.maxSnippetBytes;

	function update(name: string, v: unknown) {
		const next = setFieldValue(draftRef.current as unknown as Record<string, unknown>, name, v) as unknown as Draft;
		draftRef.current = next;
		setDraft(next);
		setErrors((e) => {
			if (!(name in e) && !("_form" in e)) return e;
			const { [name]: _, _form: __, ...rest } = e;
			return rest;
		});
	}

	async function save() {
		if (saving) return;
		// Commit any half-typed chip (ChipInput adds pending text on blur) before reading the draft.
		const active = document.activeElement;
		if (active instanceof HTMLElement) active.blur();
		// When the save does not go through, put focus back where the user was (e.g. after Ctrl+S).
		const restoreFocus = () => {
			if (active instanceof HTMLElement && active !== document.body && active.isConnected) active.focus();
		};
		await Promise.resolve();
		const current = draftRef.current;
		const local = validateSnippetInput(current);
		if (!local.ok) {
			setErrors(local.errors);
			restoreFocus();
			return;
		}
		// The per-snippet size limit needs no server data, so report it under the Code field here.
		const sizeErrors = checkLimits({ code: local.value.code }, []);
		if (sizeErrors) {
			setErrors(sizeErrors);
			restoreFocus();
			return;
		}
		if (Object.keys(chipErrorsRef.current).length > 0) {
			restoreFocus();
			return;
		}
		setSaving(true);
		try {
			const { snippet } = await api.save({ ...local.value, meta: current.meta, id: current.id });
			onSaved(snippet);
		} catch (e) {
			// EmDash 1.0.1 drops error details over HTTP; fall back to the (readable) message.
			const fieldErrors = e instanceof ApiError ? e.fieldErrors : {};
			setErrors(
				Object.keys(fieldErrors).length > 0 ? fieldErrors : { _form: e instanceof Error ? e.message : String(e) },
			);
			setSaving(false);
			restoreFocus();
		}
	}

	const chipErrorsRef = React.useRef(chipErrors);
	chipErrorsRef.current = chipErrors;
	const saveRef = React.useRef(save);
	saveRef.current = save;

	// Ctrl/Cmd+S saves; leaving the page with unsaved edits asks first.
	React.useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
				e.preventDefault();
				void saveRef.current();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	React.useEffect(() => {
		if (!dirty) return;
		function onBeforeUnload(e: BeforeUnloadEvent) {
			e.preventDefault();
		}
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	function requestClose() {
		if (saving) return;
		if (dirty) setConfirmDiscard(true);
		else onClose();
	}

	function renderField(field: FieldDef) {
		return (
			<FieldControl
				key={field.name}
				field={field}
				value={getFieldValue(draft as unknown as Record<string, unknown>, field.name)}
				error={chipErrors[field.name] ?? errors[field.name]}
				onChange={(v) => update(field.name, v)}
				onChipPending={(pending) =>
					setPendingChips((p) => {
						if (pending === Boolean(p[field.name])) return p;
						if (pending) return { ...p, [field.name]: true };
						const { [field.name]: _, ...rest } = p;
						return rest;
					})
				}
				onChipError={(err) =>
					setChipErrors((c) => {
						if (err) return { ...c, [field.name]: err };
						if (!(field.name in c)) return c;
						const { [field.name]: _, ...rest } = c;
						return rest;
					})
				}
			/>
		);
	}

	const mainFields = FIELDS.filter((f) => f.section === "main");
	const sideSections = (["settings", "targeting"] as const).map((s) => ({
		section: s,
		fields: FIELDS.filter((f) => f.section === s),
	}));

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<Button
					variant="ghost"
					size="sm"
					icon={<ArrowLeftIcon />}
					data-testid="hfc-back"
					disabled={saving}
					onClick={requestClose}
				>
					Back to snippets
				</Button>
				<div>
					<h1 className="text-2xl font-semibold leading-tight">{initial.id ? "Edit snippet" : "New snippet"}</h1>
					<p className="text-sm text-kumo-subtle">
						{initial.id
							? "Changes apply on the next page load once saved."
							: "Paste the code your provider gave you, then choose where it renders."}
					</p>
				</div>
			</div>

			{errors._form && (
				<Banner
					variant="error"
					data-testid="hfc-error-_form"
					title="The snippet could not be saved"
					description={errors._form}
				/>
			)}

			<div className="hfc-edit-grid">
				<LayerCard>
					<CardHeader
						title="Code"
						description="Tab indents, Shift+Tab outdents. Press Esc then Tab to move on."
						descriptionId={CODE_KEYS_ID}
						aside={
							<span
								data-testid="hfc-code-size"
								className={cn(
									"shrink-0 whitespace-nowrap text-sm tabular-nums",
									overLimit ? "font-medium text-kumo-danger" : "text-kumo-subtle",
								)}
							>
								{formatKB(codeBytes)} of {formatKB(LIMITS.maxSnippetBytes).replace(".0", "")}
							</span>
						}
					/>
					<div className="space-y-4 p-5">{mainFields.map(renderField)}</div>
				</LayerCard>

				<div className="hfc-side">
					{sideSections.map(({ section, fields }) =>
						fields.length === 0 ? null : (
							<LayerCard key={section}>
								<CardHeader title={SECTION_TITLE[section].title} description={SECTION_TITLE[section].description} />
								<div className="space-y-5 p-5">{fields.map(renderField)}</div>
							</LayerCard>
						),
					)}
				</div>
			</div>

			<div className="hfc-footer flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-kumo-subtle">
					{dirty ? "Unsaved changes" : "No changes yet"}
					<span className="hidden sm:inline"> · Ctrl/⌘ + S to save</span>
				</p>
				<div className="flex gap-2">
					<Button variant="secondary" data-testid="hfc-cancel" disabled={saving} onClick={requestClose}>
						Cancel
					</Button>
					<Button variant="primary" data-testid="hfc-save" loading={saving} onClick={() => void save()}>
						Save snippet
					</Button>
				</div>
			</div>

			<Dialog.Root role="alertdialog" open={confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(false)}>
				<Dialog className="max-w-md p-6" size="sm">
					<Dialog.Title className="text-lg font-semibold">Discard unsaved changes?</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle">
						Your edits to this snippet will be lost.
					</Dialog.Description>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
							Keep editing
						</Button>
						<Button
							variant="destructive"
							data-testid="hfc-discard-confirm"
							onClick={() => {
								setConfirmDiscard(false);
								onClose();
							}}
						>
							Discard
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
