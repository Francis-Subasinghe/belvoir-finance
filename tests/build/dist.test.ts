/**
 * Assertions on the built site (run automatically after `npm run build`).
 * They fail loudly if dist/ is missing rather than passing vacuously.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const DIST = "dist";
const BASE = "/belvoir-finance/";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files: string[] = [];
let pages: { file: string; html: string }[] = [];

beforeAll(() => {
  if (!existsSync(DIST)) throw new Error("dist/ not found: run `npm run build` first");
  files = walk(DIST);
  pages = files.filter((f) => f.endsWith(".html")).map((file) => ({ file, html: readFileSync(file, "utf8") }));
  if (pages.length === 0) throw new Error("no HTML pages in dist/");
});

const scriptTags = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

describe("F1-02 static output", () => {
  it("builds the expected pages under the Pages base path", () => {
    const rel = pages.map((p) => relative(DIST, p.file)).sort();
    expect(rel).toEqual(["404.html", "index.html", "stories/index.html", "stories/why-profit-isnt-cash/index.html"]);
  });

  it("has no server output", () => {
    expect(files.some((f) => /(^|\/)(server|_worker|entry\.mjs)/.test(relative(DIST, f)))).toBe(false);
  });

  it("internal asset links use the base path", () => {
    for (const { html } of pages) {
      for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) expect(m[1]?.startsWith(BASE)).toBe(true);
    }
  });
});

describe("F1-10 no Keystatic in the production build", () => {
  it("no dist path contains keystatic", () => {
    expect(files.filter((f) => /keystatic/i.test(f))).toEqual([]);
  });

  it("no built HTML/JS/CSS references keystatic", () => {
    const text = files.filter((f) => /\.(html|js|mjs|css|txt|json)$/.test(f));
    expect(text.filter((f) => /keystatic/i.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe("F1-13 only published entries are built", () => {
  it("the draft fixture produces no page and is not listed anywhere", () => {
    expect(files.some((f) => f.includes("draft-fixture"))).toBe(false);
    for (const { html } of pages) {
      expect(html).not.toContain("DRAFT-FIXTURE-MARKER");
      expect(html).not.toContain("Draft fixture story");
    }
  });
});

describe("F1-14 CSP meta tag on every page", () => {
  it.each(["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"])(
    "every page's CSP contains %s",
    (directive) => {
      for (const { file, html } of pages) {
        const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
        expect(m, file).not.toBeNull();
        const csp = (m?.[1] ?? "").replace(/&#39;/g, "'");
        expect(csp, file).toContain(directive);
      }
    },
  );

  it("script-src has no unsafe-inline or unsafe-eval, and the CSP comes before any script or style", () => {
    for (const { html } of pages) {
      const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "").replace(
        /&#39;/g,
        "'",
      );
      const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
      const cspAt = html.indexOf("Content-Security-Policy");
      for (const tag of ["<script", "<style", '<link rel="stylesheet"']) {
        const at = html.indexOf(tag);
        if (at !== -1) expect(cspAt).toBeLessThan(at);
      }
    }
  });
});

describe("F1-15 no inline script or event handlers", () => {
  it("only JSON-LD script blocks are inline; no inline <style>", () => {
    for (const { file, html } of pages) {
      for (const m of scriptTags(html)) {
        const attrs = m[1] ?? "";
        if (/\bsrc=/.test(attrs)) continue;
        expect(attrs, file).toMatch(/type="application\/ld\+json"/);
      }
      expect(html, file).not.toMatch(/<style\b/i);
      expect(html, file).not.toMatch(/\sstyle="/i);
    }
  });

  it("no on* event-handler attributes or javascript: URLs", () => {
    for (const { file, html } of pages) {
      expect(html, file).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
      expect(html, file).not.toMatch(/javascript:/i);
    }
  });
});

describe("F1-31 JSON-LD in the build", () => {
  it("every ld+json block parses and contains no raw < > &", () => {
    let count = 0;
    for (const { html } of pages) {
      for (const m of scriptTags(html)) {
        if (!/application\/ld\+json/.test(m[1] ?? "")) continue;
        count++;
        const body = m[2] ?? "";
        expect(body).not.toMatch(/[<>&]/);
        expect(() => JSON.parse(body)).not.toThrow();
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe("F1-26 page shell structure (static checks; axe runs in Playwright)", () => {
  it('every page has lang="en-GB", a skip link, one h1 and header/main/footer landmarks', () => {
    for (const { file, html } of pages) {
      expect(html, file).toContain('<html lang="en-GB"');
      expect(html, file).toMatch(/<a class="skip-link" href="#main">/);
      expect(html, file).toMatch(/<main id="main"/);
      expect(html.match(/<h1\b/g), file).toHaveLength(1);
      expect(html.match(/<header\b/g), file).toHaveLength(1);
      expect(html.match(/<main\b/g), file).toHaveLength(1);
      expect(html.match(/<footer\b/g), file).toHaveLength(1);
    }
  });
});

describe("F1-27 preview is not indexable", () => {
  it("every page has robots noindex, nofollow", () => {
    for (const { file, html } of pages)
      expect(html, file).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it("robots.txt disallows all crawling", () => {
    expect(readFileSync(join(DIST, "robots.txt"), "utf8")).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("F1-28 not-advice notice slot", () => {
  it("every page renders the placeholder notice", () => {
    for (const { file, html } of pages) {
      expect(html, file).toContain('data-testid="not-advice-notice"');
      expect(html, file).toContain("Educational information, not financial advice.");
      expect(html, file).toContain("awaiting editorial sign-off");
    }
  });
});

describe("F1-29 demo content", () => {
  it("demo stories show the demo banner", () => {
    const story = pages.find((p) => p.file.endsWith("why-profit-isnt-cash/index.html"));
    expect(story?.html).toContain('data-testid="demo-banner"');
  });
});

describe("External links (ADR-0001 req. 2)", () => {
  it("every external link is https with rel=noopener noreferrer", () => {
    let count = 0;
    for (const { html } of pages) {
      for (const m of html.matchAll(/<a\b([^>]*)>/g)) {
        const attrs = m[1] ?? "";
        const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? "";
        if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue;
        count++;
        expect(href).toMatch(/^https:\/\//);
        expect(attrs).toContain('rel="noopener noreferrer"');
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe("F1-23 fonts are self-hosted", () => {
  it("font files ship in dist and no third-party font origin is referenced", () => {
    expect(files.some((f) => f.endsWith(".woff2"))).toBe(true);
    const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(f, "utf8"));
    for (const c of css) expect(c).not.toMatch(/fonts\.(googleapis|gstatic)\.com|url\(https?:/);
  });
});
