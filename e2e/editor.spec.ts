import { expect, test } from "@playwright/test";
import { ADMIN_PAGE, createSnippet, deleteAllSnippets, login, setDevUserRole } from "./helpers.js";

test.afterAll(() => setDevUserRole(50));

test("an Editor sees the list read-only, without code, and cannot write", async ({ page, context }) => {
	setDevUserRole(50);
	await login(page);
	await deleteAllSnippets(page);
	await page.reload();
	await createSnippet(page, { name: "Secret", code: "<!--hfc-secret-code-->" });

	setDevUserRole(40);
	await context.clearCookies();
	await login(page);

	await expect(page.getByText("Secret", { exact: true })).toBeVisible();
	await expect(page.getByTestId("hfc-new")).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-edit-"]')).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-toggle-"]')).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-menu-"]')).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-duplicate-"]')).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-delete-"]')).toHaveCount(0);
	await expect(page.getByTestId("hfc-killswitch")).toHaveCount(0);
	await expect(page.locator("body")).not.toContainText("hfc-secret-code");

	// The list UI never renders code, so check the API response the Editor actually receives.
	const list = await page.evaluate(async () => {
		const res = await fetch("/_emdash/api/plugins/header-footer-code/snippets/list", {
			headers: { "X-EmDash-Request": "1" },
		});
		return { status: res.status, text: await res.text() };
	});
	expect(list.status).toBe(200);
	expect(list.text).not.toContain("hfc-secret-code");
	const listed = JSON.parse(list.text).data as { canManage: boolean; snippets: Record<string, unknown>[] };
	expect(listed.canManage).toBe(false);
	expect(listed.snippets.map((s) => s.name)).toContain("Secret");
	for (const s of listed.snippets) expect(s).not.toHaveProperty("code");

	const status = await page.evaluate(async () => {
		const res = await fetch("/_emdash/api/plugins/header-footer-code/snippets/save", {
			method: "POST",
			headers: { "X-EmDash-Request": "1", "Content-Type": "application/json" },
			body: JSON.stringify({ name: "x", code: "y" }),
		});
		return res.status;
	});
	expect(status).toBe(403);
	expect(page.url()).toContain(ADMIN_PAGE);
});
