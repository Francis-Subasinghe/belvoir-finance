// F2-38 (blocking in CI): full-page gallery screenshots at 360, 768 and 1280 px.
// EVIDENCE_DIR=<folder> instead saves plain and greyscale copies for the PR (F2-01, F2-31).
import { expect, test } from "@playwright/test";

test("gallery full page", async ({ page, browser }, info) => {
  const dir = process.env["EVIDENCE_DIR"];
  if (dir) {
    // bypassCSP only so the greyscale filter stylesheet can be injected for the evidence capture.
    const ctx = await browser.newContext({ bypassCSP: true, viewport: page.viewportSize(), reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(`${info.project.use.baseURL}design/`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${dir}/gallery-${info.project.name}.png`, fullPage: true });
    await p.addStyleTag({ content: "html { filter: grayscale(1); }" });
    await p.screenshot({ path: `${dir}/gallery-${info.project.name}-greyscale.png`, fullPage: true });
    await ctx.close();
    return;
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("design/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("gallery.png", { fullPage: true });
});
