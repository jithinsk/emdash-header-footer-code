import { createPlugin as base, type HeaderFooterCodeRuntimeOptions } from "emdash-header-footer-code/plugin";

/** Rewrites the marker HFC_TRANSFORM_ME to HFC_TRANSFORMED in every emitted snippet. */
export function createPlugin(options: HeaderFooterCodeRuntimeOptions = {}) {
	return base({
		...options,
		transforms: [({ html }) => html.replaceAll("HFC_TRANSFORM_ME", "HFC_TRANSFORMED")],
	});
}
