/**
 * Local preview servers (127.0.0.1 only, F1-30). BELVOIR_E2E_SITE and
 * BELVOIR_E2E_GALLERY point the same specs at previews on other loopback ports,
 * so the suite can run on a shared machine where 4321/4322 are someone
 * else's dev servers; anything but a 127.0.0.1 URL is refused.
 */
function local(env: string, fallback: string): string {
  const v = process.env[env];
  if (v === undefined || v === "") return fallback;
  if (!/^http:\/\/127\.0\.0\.1:\d+\/belvoir-finance\/$/.test(v)) {
    throw new Error(`${env} must be http://127.0.0.1:<port>/belvoir-finance/ (got ${v})`);
  }
  return v;
}
export const SITE = local("BELVOIR_E2E_SITE", "http://127.0.0.1:4321/belvoir-finance/");
export const GALLERY = local("BELVOIR_E2E_GALLERY", "http://127.0.0.1:4322/belvoir-finance/");
export const GALLERY_PAGE = `${GALLERY}design/`;
export const WIREFRAME_SLUGS = ["home", "explore", "topic", "story", "tools", "tool", "sources"] as const;
