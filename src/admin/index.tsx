import type { PluginAdminExports } from "emdash";
import { SnippetsPage } from "./SnippetsPage.js";

export const pages: PluginAdminExports["pages"] = {
	"/snippets": SnippetsPage,
};
