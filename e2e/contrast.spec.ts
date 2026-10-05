import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { createSnippet, deleteAllSnippets, login, setDevUserRole } from "./helpers.js";

/**
 * WCAG AA colour contrast (axe `color-contrast`) for the plugin's own UI, in light and dark.
 * Scoped to our root so EmDash's surrounding admin chrome is not judged here.
 */
async function expectNoContrastViolations(page: Page, view: string) {
	// Let Kumo's tab indicator and dialog/toast transitions settle before sampling colours.
	await page.waitForTimeout(400);
	const results = await new AxeBuilder({ page })
		.include('[data-testid="hfc-root"]')
		.withRules(["color-contrast"])
		.analyze();
	const violations = results.violations.flatMap((v) =>
		v.nodes.map((n) => `${view}: ${n.target.join(" ")} — ${n.failureSummary?.replace(/\s+/g, " ")}`),
	);
	expect(violations).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
	test.describe(`colour contrast (${colorScheme})`, () => {
		test.use({ colorScheme });

		test("list, change log and edit view meet WCAG AA contrast", async ({ page }) => {
			setDevUserRole(50);
			await login(page);
			await deleteAllSnippets(page);
			await page.reload();
			await createSnippet(page, { name: "Contrast check", code: "<!--hfc-contrast-->", include: ["/blog/*"] });
			await page.mouse.move(0, 0);

			await expect(page.getByTestId("hfc-theme-note")).toBeVisible();
			await expectNoContrastViolations(page, "list");

			await page.getByTestId("hfc-tab-changelog").click();
			await expect(page.getByTestId("hfc-changelog-row").first()).toBeVisible();
			await page.mouse.move(0, 0);
			await expectNoContrastViolations(page, "change log");

			await page.getByTestId("hfc-tab-snippets").click();
			await page.getByTestId("hfc-row-edit-" + (await rowId(page))).click();
			await expect(page.getByTestId("hfc-field-code")).toBeVisible();
			await expectNoContrastViolations(page, "edit");
		});
	});
}

async function rowId(page: Page): Promise<string> {
	const testId = await page.locator('tr[data-testid^="hfc-row-"]').first().getAttribute("data-testid");
	return testId!.replace("hfc-row-", "");
}
