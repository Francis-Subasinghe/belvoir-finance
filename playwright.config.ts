import { defineConfig, devices } from "@playwright/test";
import { GALLERY, SITE } from "./tests/helpers/e2e-urls";

// F1-26 / F2: axe, landmark, layout and component checks at 360, 768 and
// 1280 px against two local builds:
// - dist/ (the site) via `npm run preview` on 127.0.0.1:4321
// - dist-gallery/ (the dev/test-only component gallery, F2-01) via
//   `npm run preview:gallery` on 127.0.0.1:4322
// `npm run test:e2e` builds the gallery first; CI builds dist/ before it.
// Both servers bind to 127.0.0.1 only (F1-30).

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: SITE },
  webServer: [
    { command: "npm run preview", url: SITE, reuseExistingServer: false, timeout: 60_000 },
    { command: "npm run preview:gallery", url: GALLERY, reuseExistingServer: false, timeout: 60_000 },
  ],
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
