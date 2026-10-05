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
	await expect(page.getByTestId("hfc-killswitch")).toHaveCount(0);
	await expect(page.locator("body")).not.toContainText("hfc-secret-code");

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
