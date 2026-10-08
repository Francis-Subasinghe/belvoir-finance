// F3-41: full-page screenshots of the F3 templates at 360, 768 and 1280 px, in the
// same visual projects as the gallery (playwright.visual.config.ts). The gallery
// build (dist-gallery/) contains every site page, so the same preview server is used.
// Baselines come from the CI image only: tests/visual/__screenshots__/visual-*/page-*-linux.png,
// committed in #22 from CI run 37250633221 (see tests/visual/BASELINES.sha256 for the current
// source). check:visual-baselines requires exactly one per VISUAL_PAGES entry and project.
import { expect, test } from "@playwright/test";
import { TOOL_ERROR_VALUES, VISUAL_PAGES } from "../helpers/visual-pages";

for (const [name, path] of VISUAL_PAGES) {
  test(`F3-41 ${name} full page`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}

// F4-55: the explorer after a commit with one error per field (focus blurred), and with JavaScript off.
const TOOL = "tools/cash-vs-profit/";

test("F4-55 tool-errors full page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(TOOL);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-cvp-fields]")).toBeEnabled();
  for (const [id, value] of Object.entries(TOOL_ERROR_VALUES)) await page.locator(`#cvp-${id}`).fill(value);
  await page.getByRole("button", { name: "Update results" }).click();
  await expect(page.getByTestId("explorer-summary")).toHaveText("Results not updated. 5 answers need fixing.");
  await page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined,
  );
  await expect(page).toHaveScreenshot("tool-errors.png", { fullPage: true });
});

test.describe("JavaScript off", () => {
  test.use({ javaScriptEnabled: false });
  test("F4-55 tool-nojs full page", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(TOOL);
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    await expect(page.locator("[data-cvp-fields]")).toBeDisabled();
    await expect(page).toHaveScreenshot("tool-nojs.png", { fullPage: true });
  });
});
