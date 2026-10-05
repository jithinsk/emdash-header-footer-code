import type { PluginDescriptor } from "emdash";
import { PLUGIN_ID, PLUGIN_VERSION } from "./version.js";

export type { Transform, TransformContext, TransformResult, Snippet } from "./core/types.js";

export interface HeaderFooterCodeOptions {
	/**
	 * Module that exports `createPlugin`. Override this to point at a wrapper
	 * that injects transforms (functions cannot travel through descriptor options).
	 */
	entrypoint?: string;
}

export function headerFooterCode(options: HeaderFooterCodeOptions = {}): PluginDescriptor {
	const { entrypoint = "emdash-header-footer-code/plugin", ...rest } = options;
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint,
		options: rest,
		adminEntry: "emdash-header-footer-code/admin",
		adminPages: [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }],
	};
}
