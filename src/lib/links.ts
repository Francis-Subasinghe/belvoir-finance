/**
 * Link policy (ADR-0001, security requirement 2):
 * - internal links (root-relative, relative or fragment) pass through;
 * - external links must be https and get rel="noopener noreferrer";
 * - anything else (http:, javascript:, data:, mailto:, protocol-relative,
 *   malformed) is refused and should be rendered as plain text.
 */
export const EXTERNAL_REL = "noopener noreferrer";

export type SafeLink =
  | { ok: true; href: string; external: false }
  | { ok: true; href: string; external: true; rel: typeof EXTERNAL_REL }
  | { ok: false; reason: string };

// Control characters and whitespace are stripped before scheme detection,
// as browsers do (e.g. "java\tscript:").
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u0020\u007f]/g;

export function toSafeLink(raw: string | null | undefined): SafeLink {
  if (typeof raw !== "string") return { ok: false, reason: "missing href" };
  const href = raw.trim();
  if (href === "") return { ok: false, reason: "empty href" };
  const probe = href.replace(STRIP, "");

  if (probe.startsWith("//") || probe.startsWith("\\\\") || probe.startsWith("/\\")) {
    return { ok: false, reason: "protocol-relative URLs are not allowed" };
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe);
  if (!scheme) {
    return { ok: true, href, external: false };
  }
  if (scheme[1]?.toLowerCase() !== "https") {
    return { ok: false, reason: `scheme "${scheme[1]}:" is not allowed` };
  }
  let url: URL;
  try {
    url = new URL(probe);
  } catch {
    return { ok: false, reason: "malformed URL" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in URLs are not allowed" };
  }
  return { ok: true, href: url.href, external: true, rel: EXTERNAL_REL };
}
