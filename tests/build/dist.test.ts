/**
 * Assertions on the built site (run automatically after `npm run build`).
 * They fail loudly if dist/ is missing rather than passing vacuously.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { countTags, firstTagIndex, scriptBlocks, tagAttributes } from "../helpers/html";
import { F1_CSP, compiledGold, cspOf, galleryLeaks } from "../helpers/built-site";
import { expectedSite } from "../helpers/expected-site";
import { checkContentRules } from "../../src/lib/content-rules";

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

describe("F1-02 static output", () => {
  it("F3-01 builds exactly the sitemap pages, derived from the content collections", () => {
    const rel = pages.map((p) => relative(DIST, p.file).replace(/\\/g, "/")).sort();
    const want = expectedSite().pages;
    expect(want.length).toBeGreaterThan(15);
    expect(rel).toEqual(want);
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

  it("img-src is exactly 'self' and no directive allows data: (Aegis L2)", () => {
    for (const { file, html } of pages) {
      const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "").replace(
        /&#39;/g,
        "'",
      );
      const imgSrc = csp.split(";").find((d) => d.trim().startsWith("img-src"));
      expect(imgSrc?.trim(), file).toBe("img-src 'self'");
      expect(csp, file).not.toMatch(/\bdata:/);
    }
  });

  it("nothing in the build needs data: URLs (CSS, HTML src/href)", () => {
    for (const f of files.filter((x) => x.endsWith(".css"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/url\(\s*["']?data:/i);
    }
    for (const { file, html } of pages) expect(html, file).not.toMatch(/(?:src|href)\s*=\s*["']?\s*data:/i);
  });

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
      for (const tag of ["script", "style", "link"]) {
        const at = firstTagIndex(html, tag);
        if (at !== -1) expect(cspAt).toBeLessThan(at);
      }
    }
  });
});

describe("F1-15 no inline script or event handlers", () => {
  it("only JSON-LD script blocks are inline; no inline <style>", () => {
    for (const { file, html } of pages) {
      const blocks = scriptBlocks(html);
      // Every <script> opening tag must belong to a matched block.
      expect(blocks.length, file).toBe(countTags(html, "script"));
      for (const { attrs } of blocks) {
        if (/\bsrc\s*=/i.test(attrs)) continue;
        expect(attrs, file).toMatch(/type="application\/ld\+json"/i);
      }
      expect(countTags(html, "style"), file).toBe(0);
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
      for (const { attrs, body } of scriptBlocks(html)) {
        if (!/application\/ld\+json/i.test(attrs)) continue;
        count++;
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
      for (const tag of ["h1", "header", "main", "footer"]) expect(countTags(html, tag), `${file} <${tag}>`).toBe(1);
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
      expect(html, file).toMatch(
        /<aside class="notice" aria-label="Not financial advice" data-testid="not-advice-notice">/,
      );
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
      for (const attrs of tagAttributes(html, "a")) {
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

// ---------------------------------------------------------------- F2 design system

describe("F2-08 compiled CSS keeps the gold rule", () => {
  it("only :root declares the gold value, and every gold or alias use is under .surface-navy/.surface-slate", () => {
    const { problems, goldRules } = compiledGold(files);
    expect(goldRules, "the check found gold-using rules (not vacuous)").toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});

describe("F2-15 fonts stay self-hosted", () => {
  const css = () => files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(f, "utf8"));
  it("every @font-face src is a same-origin file under the base path that exists in dist, with font-display: swap", () => {
    let faces = 0;
    for (const c of css()) {
      for (const face of c.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
        faces++;
        expect(face).toMatch(/font-display:\s*swap/);
        for (const m of face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
          const url = m[1] ?? "";
          expect(url.startsWith(`${BASE}_astro/`), url).toBe(true);
          expect(existsSync(join(DIST, url.slice(BASE.length))), url).toBe(true);
        }
      }
    }
    expect(faces).toBeGreaterThan(0);
  });
  it("only the three F1 families and F1 weights are shipped", () => {
    const families = new Set<string>();
    const weights = new Set<string>();
    for (const c of css()) {
      for (const face of c.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
        families.add(/font-family:\s*["']?([^;"']+)/.exec(face)?.[1]?.trim() ?? "");
        weights.add(
          `${/font-family:\s*["']?([^;"']+)/.exec(face)?.[1]?.trim()} ${/font-weight:\s*(\d+)/.exec(face)?.[1]}`,
        );
      }
    }
    expect([...families].sort()).toEqual(["IBM Plex Mono", "Inter", "Source Serif 4"]);
    expect([...weights].sort()).toEqual([
      "IBM Plex Mono 400",
      "Inter 400",
      "Inter 600",
      "Source Serif 4 600",
      "Source Serif 4 700",
    ]);
  });
  it("no built file references a font CDN", () => {
    for (const f of files.filter((x) => /\.(html|css|js)$/.test(x))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny|cdnjs|jsdelivr|unpkg/,
      );
    }
  });
});

describe("F2-24 / F2-26 built pages", () => {
  it("every external link in built HTML goes through toSafeLink (https + rel) — covered above; no http: hrefs", () => {
    for (const { file, html } of pages) expect(html, file).not.toMatch(/href="http:/);
  });
  it("no built SVG has an inline style or a literal fill/stroke colour", () => {
    for (const { file, html } of pages) {
      for (const attrs of tagAttributes(html, "svg")) expect(attrs, file).not.toMatch(/\sstyle=/);
      expect(html, file).not.toMatch(/\s(fill|stroke)="#/);
    }
  });
});

describe("F2-29 not-advice notice and demo banner (restyle only)", () => {
  it("every page has exactly one not-advice <aside> with its testid", () => {
    for (const { file, html } of pages) {
      expect(
        html.match(/<aside class="notice" aria-label="Not financial advice" data-testid="not-advice-notice">/g),
        file,
      ).toHaveLength(1);
    }
  });
  it("the demo banner keeps its visible 'Demo content.' text and testid", () => {
    const story = pages.find((p) => p.file.endsWith("why-profit-isnt-cash/index.html"));
    expect(story?.html).toMatch(/data-testid="demo-banner"[^>]*>\s*<strong>Demo content\.<\/strong>/);
  });
});

describe("F2-33 every built page carries the unchanged F1 CSP", () => {
  it("the CSP meta content equals the F1 policy exactly", () => {
    for (const { file, html } of pages) expect(cspOf(html), file).toBe(F1_CSP);
  });
});

describe("F2-35 static by default, within the JS budget", () => {
  it("total JavaScript in dist/ is within 50 KB gzip, and every script is an external file", () => {
    const js = files.filter((f) => /\.m?js$/.test(f));
    const gz = js.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
    console.info(`F2-35: ${js.length} JS file(s), ${gz} bytes gzip`);
    expect(gz).toBeLessThanOrEqual(50 * 1024);
    for (const { html } of pages) {
      for (const { attrs } of scriptBlocks(html)) {
        if (!/\bsrc\s*=/.test(attrs)) expect(attrs).toMatch(/application\/ld\+json/);
      }
    }
  });
  it("every <img> is local and has an alt attribute", () => {
    for (const { file, html } of pages) {
      for (const attrs of tagAttributes(html, "img")) {
        expect(attrs, file).toMatch(/\salt="/);
        expect(attrs, file).toMatch(/src="\/belvoir-finance\//);
      }
    }
  });
});

describe("F2-40 the gallery stays out of production", () => {
  it("no dist path or built file references the gallery route or its markers", () => {
    expect(galleryLeaks(DIST, files)).toEqual([]);
  });
  it("F1-02's page list is unchanged (asserted above) and package.json build never sets BELVOIR_GALLERY", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build"]).toBe("astro build");
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/BELVOIR_GALLERY/);
  });
});

describe("Favicon (Launchpad: Lighthouse Best Practices, no root /favicon.ico request)", () => {
  it("every built page links the base-aware SVG icon", () => {
    for (const { file, html } of pages) {
      const icons = tagAttributes(html, "link").filter((a) => /\brel="icon"/.test(a));
      expect(icons, file).toHaveLength(1);
      expect(icons[0], file).toContain(`href="${BASE}favicon.svg"`);
      expect(icons[0], file).toContain('type="image/svg+xml"');
    }
  });
  it("the icon file exists in dist/, is a self-contained SVG and nothing references a root favicon", () => {
    const svg = readFileSync(join(DIST, "favicon.svg"), "utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    // No external references, scripts or data: URLs (CSP img-src 'self').
    expect(svg).not.toMatch(/<script|href=|url\(|data:/i);
    for (const { file, html } of pages) expect(html, file).not.toMatch(/href="\/favicon/);
  });
});

describe("belvoir-demo marker (Launchpad's Lighthouse runner skips only the SEO budget on demo pages)", () => {
  const MARKER = '<meta name="belvoir-demo" content="true">';
  const count = (text: string, needle: string) => text.split(needle).length - 1;
  const rel = (f: string) => relative(DIST, f).replace(/\\/g, "/");

  it("F3-33 finds demo pages, placeholder pages and other pages (not vacuous)", () => {
    const { demoPages, placeholderPages, pages: all } = expectedSite();
    expect(demoPages.length).toBeGreaterThan(5);
    expect(placeholderPages).toHaveLength(5);
    expect(all.length - demoPages.length - placeholderPages.length).toBeGreaterThan(5);
  });

  it("F3-33 the marker is in <head> exactly on pages whose content entry is demo: true; placeholder pages get the banner only", () => {
    const { demoPages, placeholderPages } = expectedSite();
    const demo = new Set(demoPages);
    const placeholder = new Set(placeholderPages);
    for (const { file, html } of pages) {
      const isDemo = demo.has(rel(file));
      const head = /<head\b[^>]*>([\s\S]*?)<\/head\b[^>]*>/i.exec(html)?.[1] ?? "";
      expect(count(head, MARKER), `${rel(file)} marker in <head>`).toBe(isDemo ? 1 : 0);
      expect(count(html, "belvoir-demo"), `${rel(file)} marker anywhere`).toBe(isDemo ? 1 : 0);
      expect(count(html, 'data-testid="demo-banner"'), `${rel(file)} banner`).toBe(
        isDemo || placeholder.has(rel(file)) ? 1 : 0,
      );
    }
  });

  it("F3-33 every page with the marker maps to a demo: true Story, Topic, Tool or Person entry", () => {
    const report = checkContentRules("content");
    for (const { file } of pages.filter((p) => p.html.includes(MARKER))) {
      const m = /^(stories|topics|tools|people)\/([^/]+)\/index\.html$/.exec(rel(file));
      expect(m, `${rel(file)} is not a content entry page`).not.toBeNull();
      const entry = report.entries.find((e) => e.collection === m?.[1] && e.id === m?.[2]);
      expect(entry?.raw.demo, rel(file)).toBe(true);
    }
  });

  it("F3-33 the marked-page list (for the PR)", () => {
    const marked = pages
      .filter((p) => p.html.includes(MARKER))
      .map((p) => rel(p.file))
      .sort();
    console.info(`F3-33 demo/placeholder pages: ${marked.join(", ")}`);
    expect(marked).toEqual(expectedSite().demoPages);
  });
});
