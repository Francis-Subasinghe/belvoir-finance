import { defineConfig, devices } from "@playwright/test";

// F1-26: axe + landmark checks on the built site at 360, 768 and 1280 px.
// Run after `npm run build`: `npm run test:e2e`. The preview server binds to
// 127.0.0.1 only (F1-30).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4321/belvoir-finance/" },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4321/belvoir-finance/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
