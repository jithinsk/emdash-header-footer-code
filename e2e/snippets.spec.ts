import { expect, test } from "@playwright/test";
import { ADMIN_PAGE, addChips, createSnippet, deleteAllSnippets, fetchHtml, login, pickOption, setDevUserRole } from "./helpers.js";

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
	// Turning output off asks first; cancelling leaves it on.
	await page.getByTestId("hfc-killswitch").click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByTestId("hfc-disabled-banner")).toHaveCount(0);
	await expect(page.getByTestId("hfc-killswitch")).toBeChecked();
	await page.getByTestId("hfc-killswitch").click();
	await page.getByTestId("hfc-confirm-killswitch").click();
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
	await row.locator('[data-testid^="hfc-row-menu-"]').click();
	await page.locator('[data-testid^="hfc-row-duplicate-"]').click();
	await expect(page.getByText("Orig (copy)")).toBeVisible();
	await row.locator('[data-testid^="hfc-row-menu-"]').click();
	await page.locator('[data-testid^="hfc-row-delete-"]').click();
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

test("search and the placement filter narrow the list", async ({ page }) => {
	await createSnippet(page, { name: "Alpha analytics", code: "<!--a-->", placement: "head" });
	await createSnippet(page, { name: "Beta chat", code: "<!--b-->", placement: "body:end" });
	const rows = page.locator('tr[data-testid^="hfc-row-"]');
	await expect(rows).toHaveCount(2);

	await page.getByTestId("hfc-search").fill("ALPHA");
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText("Alpha analytics");

	await page.getByTestId("hfc-search").fill("nothing like this");
	await expect(rows).toHaveCount(0);
	await expect(page.getByText("No matches")).toBeVisible();

	await page.getByTestId("hfc-search").fill("");
	await pickOption(page, "hfc-filter-placement", "Body end");
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText("Beta chat");
});

test("an invalid path chip shows the reason and is not added", async ({ page }) => {
	await page.getByTestId("hfc-new").click();
	const input = page.getByTestId("hfc-field-includePaths");
	const chips = page.getByTestId("hfc-field-includePaths-chip");

	await addChips(page, "hfc-field-includePaths", ["blog"]);
	await expect(page.getByTestId("hfc-error-includePaths")).toContainText("Path must start with /");
	await expect(chips).toHaveCount(0);
	await expect(input).toHaveValue("blog");

	// Fixing the text clears the error; Enter adds it; Backspace on the empty input removes it.
	await input.fill("/blog/*");
	await expect(page.getByTestId("hfc-error-includePaths")).toHaveCount(0);
	await input.press("Enter");
	await expect(chips).toHaveText(["/blog/*"]);
	await expect(input).toHaveValue("");
	await input.press("Backspace");
	await expect(chips).toHaveCount(0);
});

test("leaving the editor with unsaved changes asks first", async ({ page }) => {
	// No edits: Back returns straight to the list.
	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-back").click();
	await expect(page.getByTestId("hfc-new")).toBeVisible();

	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-field-name").fill("Draft only");
	await page.getByTestId("hfc-back").click();
	await expect(page.getByTestId("hfc-discard-confirm")).toBeVisible();
	await page.getByRole("button", { name: "Keep editing" }).click();
	await expect(page.getByTestId("hfc-field-name")).toHaveValue("Draft only");

	await page.getByTestId("hfc-cancel").click();
	await page.getByTestId("hfc-discard-confirm").click();
	await expect(page.getByTestId("hfc-new")).toBeVisible();
	await expect(page.getByText("Draft only", { exact: true })).toHaveCount(0);
});

test("the code editor shows its size and indents with Tab", async ({ page }) => {
	await page.getByTestId("hfc-new").click();
	const size = page.getByTestId("hfc-code-size");
	const code = page.getByTestId("hfc-field-code");
	await expect(size).toHaveText("0.0 KB of 64 KB");

	await code.fill("x".repeat(2048));
	await expect(size).toHaveText("2.0 KB of 64 KB");
	await code.fill("x".repeat(70_000));
	await expect(size).toHaveText("68.4 KB of 64 KB");

	await code.fill("<div>");
	await code.press("Home");
	await code.press("Tab");
	await expect(code).toHaveValue("  <div>");
	await code.press("Shift+Tab");
	await expect(code).toHaveValue("<div>");
	await expect(code).toBeFocused();
});
