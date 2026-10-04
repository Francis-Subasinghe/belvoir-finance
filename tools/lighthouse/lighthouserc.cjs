// Lighthouse CI config (TEST_STRATEGY.md merge-blocking check 6, budgets table).
// Run from the repo root by .github/workflows/lighthouse.yml:
//   tools/lighthouse/node_modules/.bin/lhci collect --config=tools/lighthouse/lighthouserc.cjs
//
// Audits every built page in dist-lhci/ (except 404.html), mobile preset (the
// Lighthouse default), median of 3 runs. dist-lhci/ is a CI-only build with
// PUBLIC_PREVIEW=false so SEO is measured with the preview noindex off; it is
// never deployed. Reports go to the local filesystem only, never to
// temporary-public-storage or an LHCI server.
"use strict";

const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, relative, sep } = require("node:path");

const DIST = "dist-lhci";
const ORIGIN = "http://127.0.0.1:4321";
const BASE = "/belvoir-finance/";

// Report-only until before F3 merges. Blocking is set by LHCI_BLOCKING in the
// workflow, which also drives the steps' continue-on-error.
const LEVEL = process.env.LHCI_BLOCKING === "true" ? "error" : "warn";

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const urls = walk(DIST)
  .map((f) => relative(DIST, f).split(sep).join("/"))
  .filter((f) => f.endsWith("index.html"))
  .sort()
  .map((f) => ORIGIN + BASE + f.replace(/index\.html$/, ""));
if (urls.length === 0) throw new Error(`no pages found in ${DIST}/: build it first`);

const budgets = JSON.parse(readFileSync(join(__dirname, "budgets.json"), "utf8"));
// TEST_STRATEGY: "median of 3 runs". "median" takes each metric's median across the runs.
const aggregationMethod = "median";

/** Category, LCP, CLS and TBT budgets apply to every page. */
/** @type {Record<string, unknown>} */
const common = {};
for (const [id, minScore] of Object.entries(budgets.categories)) {
  common[`categories:${id}`] = [LEVEL, { minScore, aggregationMethod }];
}
for (const [id, maxNumericValue] of Object.entries(budgets.audits)) {
  common[id] = [LEVEL, { maxNumericValue, aggregationMethod }];
}

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// JS budgets (compressed = transfer size of all scripts on the page). Tool pages get
// their own budget; every other page is treated as editorial. A tool page that is not
// built yet (e.g. /tools/cash-vs-profit/ before F4) simply matches no URL.
/** @type {{ path: string, max: number }[]} */
const tools = budgets.scriptTransferBytes.tools;
const toolsRe = tools.map((t) => escapeRe(BASE.slice(0, -1) + t.path) + "$");
const scriptSize = (/** @type {number} */ max) => [LEVEL, { maxNumericValue: max, aggregationMethod }];
const assertMatrix = [
  {
    matchingUrlPattern: `^(?!.*(?:${toolsRe.join("|")})).*$`,
    assertions: { ...common, "resource-summary:script:size": scriptSize(budgets.scriptTransferBytes.editorial) },
  },
  ...tools.map((t, i) => ({
    matchingUrlPattern: toolsRe[i],
    assertions: { ...common, "resource-summary:script:size": scriptSize(t.max) },
  })),
];

module.exports = {
  ci: {
    collect: {
      url: urls,
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
    assert: { assertMatrix },
    upload: { target: "filesystem", outputDir: ".lighthouseci/report" },
  },
};
