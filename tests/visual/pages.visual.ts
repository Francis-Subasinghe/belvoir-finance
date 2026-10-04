// F3-41: full-page screenshots of the F3 templates at 360, 768 and 1280 px, in the
// same visual projects as the gallery (playwright.visual.config.ts). The gallery
// build (dist-gallery/) contains every site page, so the same preview server is used.
// Baselines come from the CI image only; none are committed in the F3 PR.
import { expect, test } from "@playwright/test";

const PAGES: [name: string, path: string][] = [
  ["page-home", ""],
  ["page-explore", "explore/"],
  ["page-stories", "stories/"],
  ["page-topic", "topics/understand-the-numbers/"],
  ["page-story", "stories/why-profit-isnt-cash/"],
  ["page-person", "people/placeholder-author/"],
  ["page-tools", "tools/"],
  ["page-tool", "tools/cash-vs-profit/"],
  ["page-sources", "sources/"],
];

for (const [name, path] of PAGES) {
  test(`F3-41 ${name} full page`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}
