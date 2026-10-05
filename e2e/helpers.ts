import Database from "better-sqlite3";
import { type APIRequestContext, type Page, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture", "data.db");
export const ADMIN_PAGE = "/_emdash/admin/plugins/header-footer-code/snippets";

/** Log in as the dev user (dev mode only). The user's role comes from the users table. */
export async function login(page: Page) {
	await page.goto(`/_emdash/api/auth/dev-bypass?redirect=${encodeURIComponent(ADMIN_PAGE)}`);
	await expect(page.getByTestId("hfc-theme-note")).toBeVisible();
}

/** Set the dev user's role directly (40 = Editor, 50 = Admin). */
export function setDevUserRole(role: 40 | 50) {
	const db = new Database(DB_PATH);
	db.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, "dev@emdash.local");
	db.close();
}

export async function createSnippet(
	page: Page,
	s: { name: string; code: string; placement?: "head" | "body:start" | "body:end"; priority?: number; include?: string[] },
) {
	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-field-name").fill(s.name);
	await page.getByTestId("hfc-field-code").fill(s.code);
	if (s.placement) await page.getByTestId("hfc-field-placement").selectOption(s.placement);
	if (s.priority !== undefined) await page.getByTestId("hfc-field-priority").fill(String(s.priority));
	if (s.include) await page.getByTestId("hfc-field-includePaths").fill(s.include.join("\n"));
	await page.getByTestId("hfc-save").click();
	await expect(page.getByText(s.name, { exact: true })).toBeVisible();
}

/** Delete every snippet through the API so each test starts clean. */
export async function deleteAllSnippets(page: Page) {
	await page.evaluate(async () => {
		const base = "/_emdash/api/plugins/header-footer-code";
		const h = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
		const list = await (await fetch(`${base}/snippets/list`, { headers: h })).json();
		for (const s of list.data.snippets) {
			await fetch(`${base}/snippets/delete`, { method: "POST", headers: h, body: JSON.stringify({ id: s.id }) });
		}
		await fetch(`${base}/killswitch/set`, { method: "POST", headers: h, body: JSON.stringify({ disabled: false }) });
	});
}

/**
 * Fetch raw HTML (no JS execution) so assertions see server output exactly. Pass a `page` to
 * fetch with its session, or the cookieless `request` fixture to fetch as an anonymous visitor.
 */
export async function fetchHtml(client: Page | APIRequestContext, url: string): Promise<string> {
	const res = await ("request" in client ? client.request : client).get(url);
	expect(res.ok()).toBe(true);
	return res.text();
}
