/**
 * The EmDash admin ships precompiled Tailwind CSS, so utilities it never uses itself (arbitrary
 * grid templates, exact code metrics) do not exist for plugin pages. The few such rules live
 * here, scoped under `hfc-` class names and built on Kumo's CSS variables so they follow the
 * admin's light and dark themes.
 */
const CSS = `
.hfc-edit-grid {
	display: grid; gap: 1.5rem; align-items: start;
	grid-template-areas: "code" "settings" "targeting";
}
.hfc-area-code { grid-area: code; }
.hfc-area-settings { grid-area: settings; }
.hfc-area-targeting { grid-area: targeting; }
@media (min-width: 1024px) {
	.hfc-edit-grid {
		grid-template-columns: minmax(0, 1fr) 22rem;
		/* The 1fr row absorbs the Settings card's span so Code and Targeting stay together. */
		grid-template-rows: auto 1fr;
		grid-template-areas: "code settings" "targeting settings";
	}
	/* Sticky inside <main>'s scroll area; capped above the sticky footer so it never hides behind it. */
	.hfc-area-settings {
		position: sticky; top: 0;
		max-height: calc(100dvh - 11rem); overflow-y: auto;
	}
}
/* Targeting: 2x2 (Include | Exclude, Page kind | Locales) when the card is wide enough. */
.hfc-targeting { container-type: inline-size; }
.hfc-targeting-grid { display: grid; gap: 1.25rem 1.5rem; align-items: start; }
@container (min-width: 34rem) {
	.hfc-targeting-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/*
 * Snippets / Change log: brand-tinted active segment (Kumo's default is a white pill on grey).
 * Contrast (WCAG): every label >= 4.5:1, and the active pill's solid blue ring >= 3:1 against both
 * the track and its own tint (1.4.11), in light and dark. --text-color-kumo-link is blue-800 in
 * light and blue-400 in dark, so it works as a ring/text colour on either surface.
 */
.hfc-tabs .hfc-tab-indicator {
	background: color-mix(in oklab, var(--color-kumo-brand) 14%, var(--color-kumo-base));
	box-shadow: 0 0 0 1.5px var(--text-color-kumo-link);
}
.hfc-tabs .hfc-tab { cursor: pointer; transition: background-color 120ms, color 120ms; }
.hfc-tabs .hfc-tab[aria-selected="true"] { color: var(--text-color-kumo-link); font-weight: 500; }
/* Inactive: Kumo's "subtle" is only ~4:1 on the light track, "strong" passes there; in dark
   "strong" is brighter than the active label, so dark keeps "subtle" (~7.6:1). */
.hfc-tabs .hfc-tab[aria-selected="false"] {
	color: light-dark(var(--text-color-kumo-strong), var(--text-color-kumo-subtle));
}
.hfc-tabs .hfc-tab[aria-selected="false"]:hover {
	color: var(--text-color-kumo-default);
	background: color-mix(in oklab, var(--color-kumo-base) 60%, transparent);
}
/* Focus: a 2px inset ring in the same high-contrast blue (Kumo's brand ring is ~3:1 at best). */
.hfc-tabs .hfc-tab:focus-visible { box-shadow: inset 0 0 0 2px var(--text-color-kumo-link); }
.hfc-tabs .hfc-tab .hfc-tab-count { transition: background-color 120ms, color 120ms; }
.hfc-tabs .hfc-tab[aria-selected="true"] .hfc-tab-count {
	background: color-mix(in oklab, var(--color-kumo-brand) 22%, var(--color-kumo-base));
	color: var(--text-color-kumo-link);
}
/*
 * Info banner (theme note): Kumo's info Banner sets blue text on a blue tint. Keep the tint and a
 * blue icon, add a blue left accent, and use neutral text so the copy reads at body contrast.
 */
.hfc-banner-info {
	background: color-mix(in oklab, var(--color-kumo-info-tint) 55%, var(--color-kumo-base));
	box-shadow: inset 3px 0 0 var(--text-color-kumo-link);
	color: var(--text-color-kumo-default);
}
.hfc-banner-info code { color: var(--text-color-kumo-default); font-weight: 500; }
.hfc-banner-info svg { color: var(--text-color-kumo-link); }
.hfc-code-text { font-size: 13px; line-height: 20px; tab-size: 2; }
.hfc-code-area { height: 24rem; min-height: 21.5rem; white-space: pre; overflow: auto; }
.hfc-footer {
	position: sticky; bottom: -1.5rem; z-index: 10;
	margin: 0 -1.5rem -1.5rem; padding: 0.75rem 1.5rem;
	border-top: 1px solid var(--color-kumo-line);
	background: var(--color-kumo-base);
}
/* Keep Kumo's toast viewport (fixed bottom-right) clear of the sticky Save footer while the
   editor is open. Kumo gives the viewport no hook of its own, so match its utility classes. */
body:has(.hfc-footer) .fixed.top-auto.bottom-4 { bottom: 5.5rem !important; }
.hfc-where { max-width: 36rem; }
@media (max-width: 1023px) { .hfc-where { max-width: 14rem; } }
.hfc-row-clickable { cursor: pointer; }
.hfc-row-clickable:hover > td { background: color-mix(in oklab, var(--color-kumo-tint) 45%, transparent); }
.hfc-row-off > td.hfc-dim { opacity: 0.55; }
`;

export function HfcStyles() {
	return <style>{CSS}</style>;
}
