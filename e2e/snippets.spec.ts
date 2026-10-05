import { expect, test } from "@playwright/test";
import { ADMIN_PAGE, createSnippet, deleteAllSnippets, fetchHtml, login, setDevUserRole } from "./helpers.js";

test.beforeEach(async ({ page }) => {
	setDevUserRole(50);
	await login(page);
	await deleteAllSnippets(page);
	await page.reload();
});

test("shows the theme note", async ({ page }) => {
	await expect(page.getByTestId("hfc-theme-note")).toContainText("<EmDashBodyStart />");
});

test("each placement lands in the right place, never on admin pages", async ({ page, request }) => {
	await createSnippet(page, { name: "Head meta", code: '<meta name="hfc-head" content="1">', placement: "head" });
	await createSnippet(page, { name: "Start", code: '<div id="hfc-start"></div>', placement: "body:start" });
	await createSnippet(page, { name: "End", code: '<div id="hfc-end"></div>', placement: "body:end" });

	// As a visitor: for signed-in users EmDash appends its visual-editing toolbar after <EmDashBodyEnd />.
	const html = await fetchHtml(request, "/");
	const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
	expect(head).toContain('<meta name="hfc-head" content="1">');

	const body = html.slice(html.indexOf("<body"));
	const afterBodyTag = body.slice(body.indexOf(">") + 1).trimStart();
	expect(afterBodyTag.startsWith('<div id="hfc-start"></div>')).toBe(true);
	const beforeBodyClose = body.slice(0, body.lastIndexOf("</body>")).trimEnd();
	expect(beforeBodyClose.endsWith('<div id="hfc-end"></div>')).toBe(true);

	const adminHtml = await fetchHtml(page, ADMIN_PAGE);
	expect(adminHtml).not.toContain("hfc-head");
	expect(adminHtml).not.toContain("hfc-start");
	expect(adminHtml).not.toContain("hfc-end");
});

test("priority orders snippets within a placement", async ({ page }) => {
	await createSnippet(page, { name: "Second", code: "<!--hfc-second-->", priority: 20 });
	await createSnippet(page, { name: "First", code: "<!--hfc-first-->", priority: 5 });
	const html = await fetchHtml(page, "/");
	expect(html.indexOf("<!--hfc-first-->")).toBeLessThan(html.indexOf("<!--hfc-second-->"));
});

test("include paths limit where a snippet appears", async ({ page }) => {
	await createSnippet(page, { name: "Home only", code: "<!--hfc-home-only-->", include: ["/"] });
	expect(await fetchHtml(page, "/")).toContain("<!--hfc-home-only-->");
	const other = await page.request.get("/this-page-does-not-exist");
	expect(await other.text()).not.toContain("<!--hfc-home-only-->");
});

test("disabling a snippet removes it on the next load", async ({ page }) => {
	await createSnippet(page, { name: "Toggle me", code: "<!--hfc-toggle-->" });
	expect(await fetchHtml(page, "/")).toContain("<!--hfc-toggle-->");
	const row = page.locator('[data-testid^="hfc-row-"]', { hasText: "Toggle me" });
	await row.locator('[data-testid^="hfc-row-toggle-"]').click();
	await expect(row).toContainText("Off");
	expect(await fetchHtml(page, "/")).not.toContain("<!--hfc-toggle-->");
});

test("kill switch suppresses all output", async ({ page }) => {
	await createSnippet(page, { name: "Any", code: "<!--hfc-kill-->" });
	page.once("dialog", (d) => d.accept());
	await page.getByTestId("hfc-killswitch").click();
	await expect(page.getByTestId("hfc-disabled-banner")).toBeVisible();
	expect(await fetchHtml(page, "/")).not.toContain("<!--hfc-kill-->");
});

test("transform injected via wrapper entrypoint is applied", async ({ page }) => {
	await createSnippet(page, { name: "Transform", code: "<!--HFC_TRANSFORM_ME-->" });
	const html = await fetchHtml(page, "/");
	expect(html).toContain("<!--HFC_TRANSFORMED-->");
	expect(html).not.toContain("HFC_TRANSFORM_ME");
});

test("duplicate, delete with confirmation, and the change log", async ({ page }) => {
	await createSnippet(page, { name: "Orig", code: "<!--hfc-orig-->" });
	const row = page.locator('[data-testid^="hfc-row-"]', { hasText: "Orig" }).first();
	await row.locator('[data-testid^="hfc-row-duplicate-"]').click();
	await expect(page.getByText("Orig (copy)")).toBeVisible();
	await row.locator('[data-testid^="hfc-row-delete-"]').click();
	await page.getByTestId("hfc-confirm-delete").click();
	await expect(page.getByText("Orig", { exact: true })).toHaveCount(0);
	await page.getByTestId("hfc-tab-changelog").click();
	await expect(page.getByTestId("hfc-changelog-row").first()).toContainText("Deleted");
});

test("size limit shows a clear error", async ({ page }) => {
	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-field-name").fill("Too big");
	await page.getByTestId("hfc-field-code").fill("x".repeat(70_000));
	await page.getByTestId("hfc-save").click();
	await expect(page.getByTestId("hfc-error-code")).toContainText("the limit is 64 KB per snippet");
});
