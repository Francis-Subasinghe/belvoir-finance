/** Every built page as a path relative to the base URL, for the e2e suites (F3-35). */
import { expectedSite } from "./expected-site";

export function sitePaths(contentDir = "content"): string[] {
  return expectedSite(contentDir).pages.map((p) =>
    p === "404.html" ? "this-page-does-not-exist/" : p === "index.html" ? "./" : p.replace(/index\.html$/, ""),
  );
}
