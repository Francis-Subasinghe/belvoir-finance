/**
 * Site-wide build settings.
 *
 * PREVIEW is the single switch for search-engine visibility (F1-27). While the
 * site is a GitHub Pages preview (no production domain, D1) it stays on, which
 * adds `noindex, nofollow` to every page and makes robots.txt disallow all.
 * Set PUBLIC_PREVIEW=false only when the owner approves a production launch.
 */
// `?.` so plain Node and Playwright (no Vite env) can import this file for PLACEHOLDER_PAGES.
export const PREVIEW: boolean = import.meta.env?.PUBLIC_PREVIEW !== "false";

export const SITE_NAME = "Belvoir Finance";
export const SITE_TAGLINE = "Business finance, made clear.";

/**
 * Content Security Policy, delivered as a <meta> tag (F1-14). GitHub Pages
 * cannot send response headers, so frame-ancestors, HSTS and
 * X-Content-Type-Options are absent on the preview; ADR-0001 accepts this
 * for the preview only. `frame-ancestors` is ignored in a meta CSP, so it is
 * not listed here; it belongs in the D5 host's _headers file.
 * Aegis Q-9 (F4) added connect-src 'none' and require-trusted-types-for
 * 'script'; every other directive is the F1 value.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  // No data: images (Aegis L2). Fonts are self-hosted files and no CSS uses data: URLs.
  "img-src": "'self'",
  "font-src": "'self'",
  // Aegis Q-9 (F4): the site makes no requests from script, so nothing may connect.
  "connect-src": "'none'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "upgrade-insecure-requests": "",
  // Aegis Q-9 (F4): Trusted Types are required and no policy may exist, so
  // every HTML or script string sink (innerHTML, eval-like, script URLs from
  // strings) throws. No policy directive is listed and no policy is created in
  // code; tests/unit/csp-q9.test.ts scans src/, scripts/ and dist/ for either.
  "require-trusted-types-for": "'script'",
};

export function cspString(directives: Readonly<Record<string, string>> = CSP_DIRECTIVES): string {
  return Object.entries(directives)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}

export const NOT_ADVICE_PLACEHOLDER =
  "Educational information, not financial advice. [Placeholder wording — awaiting editorial sign-off; final notice ships in F10.]";

/** F3-03: the main navigation (the D12 target nav). Paths are base-relative. */
export const MAIN_NAV: readonly { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/explore/", label: "Explore" },
  { path: "/tools/", label: "Tools" },
  { path: "/sources/", label: "Sources" },
];

/** F3-03: footer links. Never a "Work with Belvoir" link (D4). */
export const FOOTER_NAV: readonly { path: string; label: string }[] = [
  { path: "/about/", label: "About" },
  { path: "/editorial-standards/", label: "Editorial standards" },
  { path: "/newsletter/", label: "Newsletter" },
  { path: "/contact/", label: "Contact" },
  { path: "/privacy/", label: "Privacy" },
  { path: "/cookies/", label: "Cookies" },
  { path: "/terms/", label: "Terms" },
];

// F3-47: the placeholder-page list lives in its own dependency-free module (also read by Lighthouse).
export { PLACEHOLDER_PAGES, isPlaceholderPage, type PlaceholderPage } from "./placeholder-pages";
