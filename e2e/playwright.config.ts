import { defineConfig } from "@playwright/test";

export const BASE_URL = "http://localhost:4399";

export default defineConfig({
	testDir: ".",
	testMatch: "*.spec.ts",
	workers: 1,
	fullyParallel: false,
	timeout: 60_000,
	use: { baseURL: BASE_URL, trace: "retain-on-failure" },
	globalSetup: "./global-setup.ts",
	webServer: {
		command: "rm -f data.db* && pnpm dev",
		cwd: "./fixture",
		url: `${BASE_URL}/_emdash/api/setup/status`,
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
	},
});
