// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig(
  {
    ignores: ["dist/", "dist-gallery/", ".astro/", "node_modules/", "coverage/", "test-results/", "playwright-report/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs["flat/recommended"],
  ...astro.configs["flat/jsx-a11y-strict"],
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Inline event handlers and javascript: URLs would break the CSP.
      "no-script-url": "error",
      // A scrollable region (wide data table) must be focusable so keyboard users can scroll it (F2-18, F2-26).
      "astro/jsx-a11y/no-noninteractive-tabindex": ["error", { tags: [], roles: ["tabpanel", "region"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name=/^on[a-z]+$/i]",
          message: "Inline event handlers are not allowed (CSP, F1-15).",
        },
      ],
    },
  },
  {
    // Tests deliberately contain hostile strings such as "javascript:alert(1)".
    files: ["tests/**"],
    rules: { "no-script-url": "off" },
  },
);
