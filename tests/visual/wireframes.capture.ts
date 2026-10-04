// D12 (F2-02): writes docs/design/wireframes/<page>-<width>.png from the gallery build.
import { test } from "@playwright/test";
import { WIREFRAME_SLUGS } from "../helpers/e2e-urls";

for (const slug of WIREFRAME_SLUGS) {
  for (const width of [360, 1280]) {
    test(`wireframe ${slug} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`design/wireframes/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `docs/design/wireframes/${slug}-${width}.png`, fullPage: true });
    });
  }
}
