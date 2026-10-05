/**
 * F3-47 (Atlas, Q-10): pages with no content entry whose wording is still a
 * placeholder until D8 and D9 are decided. This ONE list (exact paths under the
 * base) drives the demo banner and `noindex, nofollow` on those pages
 * (BaseLayout `placeholder`), and Lighthouse's SEO-only exemption by exact path
 * (tools/lighthouse/assertions.ts SEO_EXEMPT_PATHS). These pages do NOT get the
 * belvoir-demo marker: that is only for `demo: true` content (Sentinel,
 * Launchpad). Removing a page from this list is an Atlas decision recorded in the PR.
 *
 * Dependency-free so Node can load it directly (tools/lighthouse).
 */
export const PLACEHOLDER_PAGES = ["/about/", "/contact/", "/privacy/", "/cookies/", "/terms/"] as const;
export type PlaceholderPage = (typeof PLACEHOLDER_PAGES)[number];
export const isPlaceholderPage = (path: PlaceholderPage): boolean => PLACEHOLDER_PAGES.includes(path);
