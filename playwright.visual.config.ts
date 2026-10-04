import { defineConfig, devices } from "@playwright/test";
import { GALLERY } from "./tests/helpers/e2e-urls";

/**
 * F2-38 visual regression: BLOCKING in CI. Not part of `npm run test:e2e`; CI runs
 * it in the "Visual regression" job (ci.yml, ubuntu-24.04, VISUAL_BLOCKING: "true").
 * Baselines must come from that CI image (font rendering), never a local machine:
 * with none committed the job uploads them as the `visual-baselines` artifact. To
 * (re)baseline: download that artifact, copy it into tests/visual/__screenshots__/,
 * `git add -f` the *-linux.png files (the folder is gitignored) and rewrite
 * tests/visual/BASELINES.sha256 with `npm run visual:manifest -- --run <id>
 * --artifact <id> --commit <sha>`; the Repo guards step `npm run check:visual-baselines`
 * checks the hashes and rejects any other file under __screenshots__/.
 *   npm run test:visual -- --update-snapshots   (in the CI image) creates baselines
 *   npm run test:visual                          compares, threshold below
 *   npm run wireframes                           regenerates docs/design/wireframes/*.png (D12)
 * Run `npm run build:gallery` first.
 */
export default defineConfig({
  testDir: "tests/visual",
  reporter: "list",
  // {platform} keeps local (darwin/win32) snapshots from overwriting the CI linux baselines.
  snapshotPathTemplate: "tests/visual/__screenshots__/{projectName}/{arg}-{platform}{ext}",
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
