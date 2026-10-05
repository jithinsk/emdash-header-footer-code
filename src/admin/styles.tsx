/**
 * The EmDash admin ships precompiled Tailwind CSS, so utilities it never uses itself (arbitrary
 * grid templates, exact code metrics) do not exist for plugin pages. The few such rules live
 * here, scoped under `hfc-` class names and built on Kumo's CSS variables so they follow the
 * admin's light and dark themes.
 */
const CSS = `
.hfc-edit-grid { display: grid; gap: 1.5rem; align-items: start; }
@media (min-width: 1024px) {
	.hfc-edit-grid { grid-template-columns: minmax(0, 1fr) 22rem; }
}
.hfc-side { display: grid; gap: 1.5rem; }
.hfc-code-text { font-size: 13px; line-height: 20px; tab-size: 2; }
.hfc-code-area { height: 28rem; min-height: 12rem; white-space: pre; overflow: auto; }
.hfc-footer {
	position: sticky; bottom: -1.5rem; z-index: 10;
	margin: 0 -1.5rem -1.5rem; padding: 0.75rem 1.5rem;
	border-top: 1px solid var(--color-kumo-line);
	background: var(--color-kumo-base);
}
.hfc-where { max-width: 36rem; }
.hfc-row-clickable { cursor: pointer; }
.hfc-row-clickable:hover > td { background: color-mix(in oklab, var(--color-kumo-tint) 45%, transparent); }
.hfc-row-off > td.hfc-dim { opacity: 0.55; }
`;

export function HfcStyles() {
	return <style>{CSS}</style>;
}
