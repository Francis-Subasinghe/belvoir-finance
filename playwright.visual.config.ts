import { defineConfig, devices } from "@playwright/test";
import { GALLERY } from "./tests/helpers/e2e-urls";

/**
 * F2-38 visual regression: REPORT ONLY. Not part of `npm run test:e2e` or CI.
 * Baselines must be generated in the CI Linux image (font rendering), so none
 * are committed; Launchpad makes this blocking after F2 is approved.
 *   npm run test:visual -- --update-snapshots   (in the CI image) creates baselines
 *   npm run test:visual                          compares, threshold below
 *   npm run wireframes                           regenerates docs/design/wireframes/*.png (D12)
 * Run `npm run build:gallery` first.
 */
export default defineConfig({
  testDir: "tests/visual",
  reporter: "list",
  snapshotPathTemplate: "tests/visual/__screenshots__/{projectName}/{arg}{ext}",
  expect: {
    // Documented diff threshold: up to 1 % of pixels may differ, per-pixel colour tolerance 0.2.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: "disabled", caret: "hide" },
  },
  use: { baseURL: GALLERY },
  webServer: { command: "npm run preview:gallery", url: GALLERY, reuseExistingServer: false, timeout: 60_000 },
  projects: [
    {
      name: "visual-360",
      testMatch: /gallery\.visual\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } },
    },
    {
      name: "visual-768",
      testMatch: /gallery\.visual\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "visual-1280",
      testMatch: /gallery\.visual\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "wireframes", testMatch: /wireframes\.capture\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
