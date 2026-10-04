// Lighthouse CI config (TEST_STRATEGY.md merge-blocking check 6, budgets table).
// Run from the repo root by .github/workflows/lighthouse.yml:
//   tools/lighthouse/node_modules/.bin/lhci collect --config=tools/lighthouse/lighthouserc.cjs
//
// Audits every built page in dist-lhci/ (including 404.html), mobile preset (the
// Lighthouse default), median of 3 runs. dist-lhci/ is a CI-only build with
// PUBLIC_PREVIEW=false so SEO is measured with the preview noindex off; it is
// never deployed. Pages carrying <meta name="belvoir-demo" content="true"> skip
// only the SEO category, and so does /404.html (SEO_EXEMPT_PATHS in assertions.ts). Reports go to the local filesystem only, never to
// temporary-public-storage or an LHCI server. URL and assertion logic lives in
// assertions.ts (tested by tests/unit/lighthouse-config.test.ts).
"use strict";

const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
// Node 24 loads this erasable-TypeScript ES module synchronously (require(esm) + type stripping).
const { HOST, PORT, buildAssertMatrix, listPages, readBudgets } = require("./assertions.ts");

const DIST = "dist-lhci";

// Blocking when LHCI_BLOCKING=true (set in .github/workflows/lighthouse.yml, which
// also drives the steps' continue-on-error); warn-only otherwise, e.g. local runs.
const LEVEL = process.env.LHCI_BLOCKING === "true" ? "error" : "warn";

// Before collect only: refuse to start if the dedicated port is taken.
if (process.argv.includes("collect")) {
  try {
    execFileSync(process.execPath, [join(__dirname, "preflight.ts")], { stdio: "inherit" });
  } catch {
    // preflight.ts already printed the reason; exit before lhci adds its usage text.
    process.exit(1);
  }
}

const pages = listPages(DIST);
const budgets = readBudgets(join(__dirname, "budgets.json"));

module.exports = {
  ci: {
    collect: {
      url: pages.map((p) => p.url),
      numberOfRuns: 3,
      // Host 127.0.0.1 comes from astro.config.mjs (F1-30); a dedicated port keeps
      // clear of the dev server. The ready pattern needs astro's own "Local" line for
      // this exact URL, so a server that moved to another port never counts as ready.
      startServerCommand: `npx astro preview --outDir ${DIST} --port ${PORT}`,
      startServerReadyPattern: `http://${HOST.replaceAll(".", "\\.")}:${PORT}/belvoir-finance/`,
      startServerReadyTimeout: 60000,
      settings: {
        // No preset: Lighthouse's default mobile emulation and throttling (TEST_STRATEGY "mobile preset").
        // --no-sandbox: CI runners block Chrome's user-namespace sandbox. Only our own
        // locally served pages are loaded.
        chromeFlags: "--headless=new --no-sandbox",
      },
    },
    assert: { assertMatrix: buildAssertMatrix(budgets, pages, LEVEL) },
    upload: { target: "filesystem", outputDir: ".lighthouseci/report" },
  },
};
