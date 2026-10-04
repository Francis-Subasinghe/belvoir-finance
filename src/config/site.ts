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
 */
export const CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  // No data: images (Aegis L2). Fonts are self-hosted files and no CSS uses data: URLs.
  "img-src": "'self'",
  "font-src": "'self'",
  "connect-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "upgrade-insecure-requests": "",
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

/**
 * F3-47 (Atlas, Q-10): pages with no content entry whose wording is still a
 * placeholder until D8 and D9 are decided. Each passes `demo` to BaseLayout
 * from this list, so it gets the demo banner, `noindex` and the belvoir-demo
 * marker. Removing a page from this list is an Atlas decision recorded in the PR.
 */
export const PLACEHOLDER_PAGES = ["/about/", "/contact/", "/privacy/", "/cookies/", "/terms/"] as const;
export type PlaceholderPage = (typeof PLACEHOLDER_PAGES)[number];
export const isPlaceholderPage = (path: PlaceholderPage): boolean => PLACEHOLDER_PAGES.includes(path);
