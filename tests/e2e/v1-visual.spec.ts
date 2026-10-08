/**
 * V1 visual layer, E2E (docs/qa/AC_V1_VISUAL.md v0.2): motion (V1-25 to V1-31,
 * V1-57), covers and visibility (V1-21) and the layout fixes (V1-58 to V1-61)
 * on the built site (dist/, `npm run preview`) and the gallery build, at the
 * three project widths (360, 768, 1280 px). The gold rule, axe, overflow and
 * target checks on every page with art (V1-15, V1-22) are shell.spec.ts and
 * gallery.spec.ts; the font-delay CLS guard is layout-shift.spec.ts.
 *
 * Every layout check has a negative check: the same measurement with the F3
 * rule injected back (bypassCSP only so that test style can be added) fails.
 */
import { expect, test } from "@playwright/test";
import { sitePaths } from "../helpers/e2e-pages";
import { GALLERY_PAGE } from "../helpers/e2e-urls";
import {
  animatedAncestry,
  coveredProblems,
  hiddenContentProblems,
  installOpacitySampler,
  opacityDrops,
  pillGapProblems,
  reducedMotionProblems,
  textOutsidePillProblems,
  verticalGap,
  wrappedLabelProblems,
} from "../helpers/v1-e2e";

const PAGES = sitePaths();
const TARGETS: [string, string][] = [...PAGES.map((p): [string, string] => [`/${p}`, p]), ["gallery", GALLERY_PAGE]];
const STORY = "stories/why-profit-isnt-cash/"; // demo story with a chart and a cover
const PERSON = "people/placeholder-author/";
const MOTION_PAGES = ["./", "explore/", STORY];
const SAMPLE_MS = [0, 50, 100, 200, 400, 1000];
const NO_ANIMATION = "*, *::before, *::after { animation: none !important; transition: none !important; }";

/* ---------------------------------------------------------------- V1-25 reduce */

test.describe("V1-25 nothing moves under prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });
  for (const [name, url] of TARGETS) {
    test(`V1-25 no animation or transition on ${name}, after load and after scrolling to the end`, async ({ page }) => {
      await page.goto(url);
      expect(await reducedMotionProblems(page)).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      expect(await reducedMotionProblems(page)).toEqual([]);
    });
  }
});

/* ---------------------------------------------------------------- V1-26 visible without animation or JS */

test.describe("V1-26 content is visible with animation forced off", () => {
  test.use({ reducedMotion: "no-preference", bypassCSP: true });
  for (const [name, url] of TARGETS) {
    test(`V1-26 (a) every text, image and SVG element on ${name} is at opacity 1 and in place`, async ({ page }) => {
      await page.goto(url);
      await page.addStyleTag({ content: NO_ANIMATION });
      expect(await hiddenContentProblems(page)).toEqual([]);
    });
  }

  test("V1-26 negative: a base `.reveal { opacity: 0 }` rule is caught", async ({ page }) => {
    await page.goto(STORY);
    await page.addStyleTag({ content: `${NO_ANIMATION} main h2 { opacity: 0; }` });
    expect((await hiddenContentProblems(page)).length).toBeGreaterThan(0);
  });
});

test.describe("V1-26 (b) without JavaScript nothing below the fold is hidden", () => {
  test.use({ javaScriptEnabled: false, reducedMotion: "no-preference" });
  for (const path of [...MOTION_PAGES, "stories/", "topics/understand-the-numbers/"]) {
    test(`V1-26 (b) below-the-fold elements on /${path} compute opacity 1 (no scrolling)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1000); // the load stagger (≤ 800 ms) is over; view() timelines stay inactive
      await page.screenshot({ fullPage: true });
      expect(await hiddenContentProblems(page, true)).toEqual([]);
    });
  }
});

/* ---------------------------------------------------------------- V1-57 no blink */

test.describe("V1-57 no blink: opacity never drops after first paint", () => {
  test.use({ reducedMotion: "no-preference", bypassCSP: true });
  for (const path of MOTION_PAGES) {
    test(`V1-57 opacity samples at ${SAMPLE_MS.join("/")} ms are non-decreasing on /${path}`, async ({ page }) => {
      await installOpacitySampler(page, SAMPLE_MS);
      await page.goto(path);
      const { drops, animated } = await opacityDrops(page, SAMPLE_MS.length);
      expect(drops).toEqual([]);
      // The sampler did see the load fade (cards with covers or pillar art).
      if (path !== STORY) expect(animated, "elements caught mid-fade").toBeGreaterThan(0);
    });
  }

  test("V1-57 negative: a delayed fade from opacity 0 is caught as a drop", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "main h1 { animation: v1-blink 300ms 150ms; } @keyframes v1-blink { from { opacity: 0; } }";
        document.head.append(s);
      });
    });
    await installOpacitySampler(page, SAMPLE_MS);
    await page.goto("./");
    expect((await opacityDrops(page, SAMPLE_MS.length)).drops.join("\n")).toContain("h1");
  });
});

/* ---------------------------------------------------------------- V1-28 / V1-31 timings */

type Timing = {
  name: string;
  target: string;
  start: number;
  delay: number;
  duration: number;
  iterations: number;
  fill: string;
};

async function recordAnimations(page: import("@playwright/test").Page, path: string): Promise<Timing[]> {
  await page.addInitScript(() => {
    const w = window as unknown as { __anims: Timing[] };
    w.__anims = [];
    const grab = () =>
      requestAnimationFrame(() => {
        for (const a of document.getAnimations()) {
          if (a.timeline !== document.timeline) continue; // scroll-driven: no time cap applies
          const effect = a.effect;
          if (!effect) continue;
          const t = effect.getComputedTiming();
          const target = (effect as KeyframeEffect).target;
          w.__anims.push({
            name: (a as CSSAnimation).animationName ?? "",
            target: target ? `${target.tagName.toLowerCase()}.${[...target.classList].join(".")}` : "",
            start: Number(a.startTime ?? 0),
            delay: Number(t.delay ?? 0),
            duration: Number(t.duration ?? 0),
            iterations: Number(t.iterations ?? 1),
            fill: String(t.fill),
          });
        }
      });
    document.addEventListener("DOMContentLoaded", grab);
  });
  await page.goto(path);
  await page.waitForFunction(() => document.readyState === "complete");
  return page.evaluate(() => (window as unknown as { __anims: Timing[] }).__anims);
}

test.describe("V1-28 / V1-31 animation timings (getAnimations)", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const path of ["./", "explore/", STORY]) {
    test(`V1-28 the load stagger on /${path}: ≤ 6 steps, each ≤ 400 ms, all done ≤ 800 ms, no delay or fill`, async ({
      page,
    }) => {
      const all = await recordAnimations(page, path);
      for (const a of all) {
        expect(a.iterations, `${a.name} on ${a.target}`).toBe(1);
        expect(a.duration, `${a.name} on ${a.target}`).toBeLessThanOrEqual(1000);
        expect(["none", "auto", "forwards"], `${a.name} fill`).toContain(a.fill);
      }
      const stagger = all.filter((a) => a.name === "belvoir-art-enter");
      if (path !== STORY) expect(stagger.length, "the stagger runs").toBeGreaterThan(0);
      for (const a of stagger) {
        expect(a.delay, a.target).toBe(0); // V1-57: stagger by duration, never by delay
        expect(a.duration, a.target).toBeLessThanOrEqual(400);
      }
      expect(new Set(stagger.map((a) => a.duration)).size).toBeLessThanOrEqual(6);
      if (stagger.length > 0) {
        const first = Math.min(...stagger.map((a) => a.start));
        const last = Math.max(...stagger.map((a) => a.start + a.delay + a.duration));
        expect(last - first).toBeLessThanOrEqual(800);
      }
    });
  }

  test("V1-31 chart bars draw in once by scaleY from the baseline (≤ 600 ms); values and table are there from the first frame", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () =>
        requestAnimationFrame(() => {
          const w = window as unknown as { __chartFirstFrame: string[] };
          w.__chartFirstFrame = [...document.querySelectorAll(".chart .chart-value, .chart .data-table td")].map(
            (e) => {
              let o = 1;
              for (let x: Element | null = e; x; x = x.parentElement) o *= parseFloat(getComputedStyle(x).opacity);
              return `${(e.textContent ?? "").trim()}@${o}`;
            },
          );
        }),
      );
    });
    const all = await recordAnimations(page, STORY);
    const bars = all.filter((a) => a.target.includes("chart-bar"));
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.name).toBe("belvoir-bar-draw");
      expect(b.duration).toBeLessThanOrEqual(600);
      expect(b.iterations).toBe(1);
    }
    expect(all.filter((a) => !a.target.includes("chart-bar") && a.target.includes("chart"))).toEqual([]);
    const bar = page.locator(".chart-bar").first();
    await expect(bar).toHaveCSS("transform-box", "fill-box");
    await expect(bar).toHaveCSS("transform-origin", /% 100%$|px \d+(\.\d+)?px$/);
    const first = await page.evaluate(() => (window as unknown as { __chartFirstFrame: string[] }).__chartFirstFrame);
    expect(first.length).toBeGreaterThan(0);
    for (const v of first) expect(v, "a chart value or table cell at first frame").toMatch(/\S@1$/);
  });

  test("V1-31 under reduce the chart is static", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(new URL(STORY, test.info().project.use.baseURL).href);
    const state = await page.evaluate(() =>
      [...document.querySelectorAll(".chart-bar")].map((b) => [
        b.getAnimations().length,
        getComputedStyle(b).transform,
      ]),
    );
    expect(state.length).toBeGreaterThan(0);
    for (const [n, t] of state) expect([n, t]).toEqual([0, "none"]);
    await ctx.close();
  });
});

/* ---------------------------------------------------------------- V1-29 LCP and banner */

test.describe("V1-29 the LCP element, the hero and the demo banner are never animated", () => {
  test.use({ reducedMotion: "no-preference" });
  for (const path of PAGES) {
    test(`V1-29 /${path}: LCP element, h1, hero art and demo banner (and ancestors) not animated`, async ({ page }) => {
      await page.addInitScript(() => {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1) as unknown as { element?: Element | null };
          document.querySelector("[data-v1-lcp]")?.removeAttribute("data-v1-lcp");
          last?.element?.setAttribute("data-v1-lcp", "");
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      await page.goto(path);
      await page.waitForTimeout(100); // inside the stagger window, so a fade on these would still be running
      await expect(page.locator("[data-v1-lcp]")).toHaveCount(1);
      const problems = [
        ...(await animatedAncestry(page, "[data-v1-lcp]")),
        ...(await animatedAncestry(page, "main h1")),
        ...(await animatedAncestry(page, '[data-testid="hero-art"]')),
        ...(await animatedAncestry(page, '[data-testid="demo-banner"]')),
      ];
      expect(problems).toEqual([]);
    });
  }
});

/* ---------------------------------------------------------------- V1-30 hover and focus */

test.describe("V1-30 the card lift has a keyboard equivalent", () => {
  test.use({ reducedMotion: "no-preference" });
  const lift = (page: import("@playwright/test").Page, i: number) =>
    page.evaluate((n) => {
      const card = document.querySelectorAll(".story-card")[n];
      return card ? new DOMMatrixReadOnly(getComputedStyle(card).transform).m42 : Number.NaN;
    }, i);

  test("V1-30 hover and keyboard focus give the same ≤ 4 px lift; focus keeps the F2-30 outline; hover reveals nothing", async ({
    page,
  }) => {
    await page.goto("explore/");
    const card = page.locator(".story-card").first();
    const text = await card.innerText();
    expect(await lift(page, 0)).toBe(0);
    await card.hover();
    await page.waitForTimeout(400);
    const hovered = await lift(page, 0);
    expect(hovered).toBeLessThan(0);
    expect(hovered).toBeGreaterThanOrEqual(-4);
    expect(await card.innerText()).toBe(text);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    expect(await lift(page, 0)).toBe(0);
    await card.locator(".story-card-title a").focus();
    await page.waitForTimeout(400);
    expect(await lift(page, 0)).toBe(hovered);
    const outline = await card
      .locator(".story-card-title a")
      .evaluate((a) => [getComputedStyle(a).outlineStyle, parseFloat(getComputedStyle(a).outlineWidth)] as const);
    expect(outline[0]).not.toBe("none");
    expect(outline[1]).toBeGreaterThanOrEqual(2);
  });

  test("V1-30 the gallery's hover and focus states show the same lift", async ({ page }) => {
    await page.goto(GALLERY_PAGE);
    const m42 = (id: string) =>
      page
        .getByTestId(id)
        .locator(".story-card")
        .evaluate((c) => new DOMMatrixReadOnly(getComputedStyle(c).transform).m42);
    expect(await m42("card-hover")).toBe(-4);
    expect(await m42("card-focus")).toBe(-4);
    await expect(page.getByTestId("card-focus").locator(".story-card-title a")).not.toHaveCSS("outline-style", "none");
  });
});

/* ---------------------------------------------------------------- V1-21 covers */

test.describe("V1-21 covers add no text or focus stop and hide nothing", () => {
  for (const [name, url] of TARGETS) {
    test(`V1-21 ${name}: covers are text-free and unfocusable; labels, person flags and the banner are on top`, async ({
      page,
    }) => {
      await page.goto(url);
      const covers = await page.locator('[data-testid="story-cover"]').evaluateAll((els) =>
        els.map((c) => ({
          text: (c.textContent ?? "").trim(),
          textNodes: c.querySelectorAll("text, title, desc, h1, h2, h3, h4, h5, h6").length,
          focusable: c.querySelectorAll('a, button, input, select, textarea, [tabindex], svg[focusable="true"]').length,
          hidden: c.querySelector("svg")?.getAttribute("aria-hidden"),
        })),
      );
      for (const c of covers) expect(c).toEqual({ text: "", textNodes: 0, focusable: 0, hidden: "true" });
      const problems = [
        ...(await coveredProblems(page, '[data-testid="jurisdiction-label"]')),
        ...(await coveredProblems(page, '[data-testid="placeholder-flag"]')),
        ...(await coveredProblems(page, '[data-testid="demo-banner"]')),
      ];
      expect(problems).toEqual([]);
    });
  }
});

/* ---------------------------------------------------------------- V1-58 to V1-61 layout fixes */

test.describe("V1-58 to V1-61 layout fixes", () => {
  test.use({ bypassCSP: true, reducedMotion: "reduce" });

  test("V1-58 the wrapped 60-character jurisdiction label stays inside its border", async ({ page }) => {
    await page.goto(GALLERY_PAGE);
    expect(await textOutsidePillProblems(page, '[data-testid="card-long-other"] .story-card-jurisdiction')).toEqual([]);
  });

  test("V1-58 negative: the F3 pill radius lets the wrapped text run over the border", async ({ page }) => {
    await page.goto(GALLERY_PAGE);
    await page.addStyleTag({
      content: ".story-card-jurisdiction { border-radius: var(--radius-pill) !important; max-width: none !important; }",
    });
    expect(
      (await textOutsidePillProblems(page, '[data-testid="card-long-other"] .story-card-jurisdiction')).length,
    ).toBeGreaterThan(0);
  });

  const PILLS = ".story-card-jurisdiction, .story-card-demo";
  for (const [name, url] of [
    ...TARGETS.filter(([n]) => n === "/explore/" || n === "/stories/" || n === "/"),
    ["gallery", GALLERY_PAGE] as [string, string],
  ]) {
    test(`V1-59 adjacent pills on ${name} are ≥ 4 px apart`, async ({ page }) => {
      await page.goto(url);
      expect(await pillGapProblems(page, ".story-card", PILLS)).toEqual([]);
    });
  }

  test("V1-59 the gallery has cards with both pills, and the F3 margins fail the gap check", async ({ page }) => {
    await page.goto(GALLERY_PAGE);
    const both = await page
      .locator(".story-card")
      .evaluateAll(
        (cards) =>
          cards.filter((c) => c.querySelector(".story-card-jurisdiction") && c.querySelector(".story-card-demo"))
            .length,
      );
    expect(both).toBeGreaterThan(0);
    await page.addStyleTag({ content: ".story-card-demo, .story-card-jurisdiction { margin-right: 0 !important; }" });
    const f3 = await pillGapProblems(page, ".story-card", PILLS);
    if (test.info().project.name === "mobile-360") {
      // At 360 px every card's pills stack (8 px vertical margin in F3 too), so there is no side-by-side pair to break.
      expect(f3).toEqual([]);
    } else {
      expect(f3.join("\n")).toMatch(/horizontal gap 0\.0 px/);
    }
  });

  test("V1-60 the person page's placeholder pill sits ≥ 4 px above Role", async ({ page }) => {
    await page.goto(PERSON);
    const flag = '[data-testid="placeholder-flag"]';
    expect(await verticalGap(page, flag, ".definition-list dt")).toBeGreaterThanOrEqual(4);
    await page.goto(GALLERY_PAGE);
    expect(
      await verticalGap(
        page,
        '[data-testid="person-variant"] .story-card-demo',
        '[data-testid="person-variant"] .definition-list dt',
      ),
    ).toBeGreaterThanOrEqual(4);
  });

  test("V1-60 negative: with the F3 spacing the pill touches Role", async ({ page }) => {
    await page.goto(PERSON);
    await page.addStyleTag({ content: ".story-card-demo + .definition-list { margin-top: 0 !important; }" });
    expect(await verticalGap(page, '[data-testid="placeholder-flag"]', ".definition-list dt")).toBeLessThan(4);
  });

  test("V1-61 'Reviewed by' is one line on the demo story and with a 60-character reviewer name", async ({ page }) => {
    await page.goto(STORY);
    expect(await wrappedLabelProblems(page, ".article-meta dt", "Reviewed by")).toEqual([]);
    await page.goto(GALLERY_PAGE);
    expect(
      await wrappedLabelProblems(page, '[data-testid="byline-long-name"] .article-meta dt', "Reviewed by"),
    ).toEqual([]);
  });

  test("V1-61 negative: the F3 byline CSS wraps 'Reviewed by' at 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(GALLERY_PAGE);
    await page.addStyleTag({ content: ".article-meta dt { white-space: normal !important; }" });
    expect(
      (await wrappedLabelProblems(page, '[data-testid="byline-long-name"] .article-meta dt', "Reviewed by")).length,
    ).toBeGreaterThan(0);
  });
});
