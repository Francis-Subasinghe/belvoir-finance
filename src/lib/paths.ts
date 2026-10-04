/** Prefix an internal path with the configured base (`/belvoir-finance/`). */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith("/") ? base : `${base}/`;
  return `${b}${path.replace(/^\/+/, "")}`;
}
