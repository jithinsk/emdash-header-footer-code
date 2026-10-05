import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { headerFooterCode } from "emdash-header-footer-code";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [headerFooterCode({ entrypoint: "hfc-test-transform/plugin" })],
		}),
	],
	devToolbar: { enabled: false },
	// The plugin's admin page imports these; pre-bundling them avoids Vite discovering them on
	// the first admin load and force-reloading the page mid-test.
	vite: { optimizeDeps: { include: ["@cloudflare/kumo", "emdash/plugin-utils"] } },
});
