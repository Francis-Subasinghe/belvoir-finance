// @ts-check
import { defineConfig } from "astro/config";
import markdoc from "@astrojs/markdoc";

/**
 * Keystatic (local mode) is a development-only tool. It is added only by
 * `npm run keystatic`, which runs `astro dev` with BELVOIR_KEYSTATIC=1, so
 * `astro build` never emits a /keystatic route or its admin assets
 * (ADR-0001, security requirement 0). tests/build/dist.test.ts asserts this.
 *
 * Keystatic's admin UI calls a hard-coded root path (/api/keystatic/...), so
 * in Keystatic mode the site is served from "/" instead of the Pages base.
 */
const isDev = process.argv.includes("dev");
const keystaticMode = isDev && process.env.BELVOIR_KEYSTATIC === "1";

/**
 * F2 component gallery and D12 wireframes: dev and tests only. Added only
 * when BELVOIR_GALLERY=1, which only scripts/gallery.ts sets (`npm run
 * dev:gallery`, `npm run build:gallery`). `npm run build` never sets it, so
 * dist/ has no /design/ route (F2-40, asserted in tests/build/dist.test.ts).
 * The gallery test build goes to dist-gallery/ (gitignored, never deployed)
 * and its preview server uses port 4322 so it can't be mistaken for dist/.
 */
const galleryMode = process.env.BELVOIR_GALLERY === "1" && !keystaticMode;

/** @type {import("astro").AstroIntegration} */
const gallery = {
  name: "belvoir-gallery",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      injectRoute({ pattern: "/design", entrypoint: "./src/gallery/index.astro" });
      injectRoute({ pattern: "/design/wireframes/[page]", entrypoint: "./src/gallery/wireframes/[page].astro" });
    },
  },
};

/** @type {import("astro").AstroIntegration[]} */
const devOnlyIntegrations = [];
if (keystaticMode) {
  const { default: react } = await import("@astrojs/react");
  const { default: keystatic } = await import("@keystatic/astro");
  devOnlyIntegrations.push(react(), keystatic());
}

export default defineConfig({
  // GitHub Pages project preview (ADR-0001, D1/D5).
  site: process.env.PUBLIC_SITE_URL ?? "https://francis-subasinghe.github.io",
  base: keystaticMode ? "/" : "/belvoir-finance/",
  trailingSlash: keystaticMode ? "ignore" : "always",
  output: "static",
  outDir: galleryMode ? "./dist-gallery" : "./dist",
  // F1-30: local-only dev and preview servers.
  server: { host: "127.0.0.1", port: galleryMode ? 4322 : 4321 },
  build: {
    // Keep all CSS in external files so the CSP needs no 'unsafe-inline'.
    inlineStylesheets: "never",
  },
  devToolbar: { enabled: false },
  integrations: [markdoc({ allowHTML: false }), ...devOnlyIntegrations, ...(galleryMode ? [gallery] : [])],
});
