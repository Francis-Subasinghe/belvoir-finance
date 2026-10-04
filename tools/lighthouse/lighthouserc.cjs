// Lighthouse CI config (TEST_STRATEGY.md merge-blocking check 6, budgets table).
// Run from the repo root by .github/workflows/lighthouse.yml:
//   tools/lighthouse/node_modules/.bin/lhci collect --config=tools/lighthouse/lighthouserc.cjs
//
// Audits every built page in dist-lhci/ (except 404.html), mobile preset (the
// Lighthouse default), median of 3 runs. dist-lhci/ is a CI-only build with
// PUBLIC_PREVIEW=false so SEO is measured with the preview noindex off; it is
// never deployed. Pages carrying <meta name="belvoir-demo" content="true"> skip
// only the SEO category. Reports go to the local filesystem only, never to
// temporary-public-storage or an LHCI server. URL and assertion logic lives in
// assertions.ts (tested by tests/unit/lighthouse-config.test.ts).
"use strict";

const { join } = require("node:path");
// Node 24 loads this erasable-TypeScript ES module synchronously (require(esm) + type stripping).
const { buildAssertMatrix, listPages, readBudgets } = require("./assertions.ts");

const DIST = "dist-lhci";

// Report-only until before F3 merges. Blocking is set by LHCI_BLOCKING in the
// workflow, which also drives the steps' continue-on-error.
const LEVEL = process.env.LHCI_BLOCKING === "true" ? "error" : "warn";

const pages = listPages(DIST);
const budgets = readBudgets(join(__dirname, "budgets.json"));

module.exports = {
  ci: {
    collect: {
      url: pages.map((p) => p.url),
      numberOfRuns: 3,
      // astro preview takes host and port from astro.config.mjs (127.0.0.1:4321, F1-30).
      startServerCommand: `npx astro preview --outDir ${DIST}`,
      startServerReadyPattern: "127\\.0\\.0\\.1:4321",
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
