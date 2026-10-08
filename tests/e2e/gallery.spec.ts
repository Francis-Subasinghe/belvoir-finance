/**
 * F2 E2E checks on the component gallery test build (dist-gallery/, served
 * on 127.0.0.1:4322 by `npm run preview:gallery`; never astro dev, F2-01).
 * Runs at 360, 768 and 1280 px (playwright.config.ts projects).
 */
import { expect, test } from "@playwright/test";
import { GALLERY, GALLERY_PAGE, WIREFRAME_SLUGS } from "../helpers/e2e-urls";
import {
  TEXT_SPACING_CSS,
  axeProblems,
  clippingProblems,
  collectCspErrors,
  focusStop,
  fontProblems,
  numericProblems,
  overflowProblems,
  renderedGoldProblems,
  targetSizeProblems,
  type FocusStop,
} from "../helpers/e2e-checks";

const PAGES = [GALLERY_PAGE, ...WIREFRAME_SLUGS.map((s) => `${GALLERY}design/wireframes/${s}/`)];

for (const url of PAGES) {
  const name = url.replace(GALLERY, "/");
  test.describe(`gallery build: ${name}`, () => {
    test("F2-36 / F2-34: axe 0 serious/critical, 0 region; no CSP console errors", async ({ page }) => {
      const csp = collectCspErrors(page);
      await page.goto(url);
      const { bad, region } = await axeProblems(page);
      expect(bad).toEqual([]);
      expect(region).toEqual([]);
      expect(csp).toEqual([]);
    });

    test("F2-01 / F2-36: lang, skip link, one h1, banner/main/contentinfo, noindex", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      await expect(page.getByTestId("design-gallery")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    });

    test("F2-09: gold only on navy/slate, #7E6026 only on light (rendered)", async ({ page }) => {
      await page.goto(url);
      expect(await renderedGoldProblems(page)).toEqual([]);
    });

    test("F2-18: no horizontal overflow outside a named, focusable scroll region", async ({ page }) => {
      await page.goto(url);
      expect(await overflowProblems(page)).toEqual([]);
    });

    test("F2-19: interactive targets are at least 24 x 24 px", async ({ page }) => {
      await page.goto(url);
      expect(await targetSizeProblems(page)).toEqual([]);
    });
  });
}

test.describe("gallery page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY_PAGE);
  });

  test("F3-52: the new StoryCard label and ArticleHeader byline variants are shown", async ({ page }) => {
    await expect(page.getByTestId("card-non-uk").getByTestId("jurisdiction-label")).toHaveText("Jurisdiction: Ireland");
    await expect(page.getByTestId("card-other").getByTestId("jurisdiction-label")).toHaveText(
      "Jurisdiction: Other jurisdiction (Placeholder territory)",
    );
    const header = page.getByTestId("article-header").nth(1);
    await expect(header.getByTestId("placeholder-flag")).toHaveCount(2);
    await expect(header.getByTestId("byline-credentials")).toHaveText(", Placeholder verified credential");
    await expect(header.getByRole("link", { name: "Placeholder Author" })).toHaveCount(1);
  });

  test("F2-01: every component is present in every variant", async ({ page }) => {
    // V1-49 adds the hover/focus cards, the long-label card and the 60-character byline.
    await expect(page.getByTestId("story-card")).toHaveCount(9);
    await expect(page.getByTestId("article-header")).toHaveCount(4);
    await expect(page.getByTestId("source-note")).toHaveCount(2);
    await expect(page.getByTestId("callout")).toHaveCount(8);
    await expect(page.getByTestId("chart")).toHaveCount(2);
    // V1-49: the art variants.
    await expect(page.getByTestId("hero-art")).toHaveCount(1);
    await expect(page.getByTestId("pillar-art")).toHaveCount(4);
    await expect(page.getByTestId("icon-set").locator("svg.icon")).toHaveCount(5);
    expect(await page.getByTestId("story-cover").count()).toBeGreaterThanOrEqual(6);
    await expect(page.getByTestId("diagram")).toHaveCount(1);
    for (const id of ["card-hover", "card-focus", "card-long-other", "person-variant", "byline-long-name"]) {
      await expect(page.getByTestId(id), id).toHaveCount(1);
    }
    await expect(page.getByTestId("status-notice")).toHaveCount(8);
    await expect(page.getByTestId("demo-banner")).toHaveCount(1);
    for (const s of ["white", "alabaster", "navy", "slate"]) {
      expect(await page.locator(`[data-surface="${s}"]`).count(), s).toBeGreaterThan(0);
    }
    for (const t of ["text", "email", "number"]) {
      expect(await page.locator(`input[type="${t}"]`).count(), t).toBeGreaterThan(0);
    }
    for (const state of ["is-hover", "is-focus"]) {
      for (const sel of [
        "input.input",
        "select",
        "input.checkbox",
        "button.button-primary",
        "button.button-secondary",
      ]) {
        expect(await page.locator(`${sel}.${state}`).count(), `${sel}.${state}`).toBeGreaterThan(0);
      }
    }
    for (const sel of ["input.input", "select", "input.checkbox", "button.button-primary", "button.button-secondary"]) {
      expect(await page.locator(`${sel}:disabled`).count(), `${sel} disabled`).toBeGreaterThan(0);
    }
    for (const sel of ["input.input", "select", "input.checkbox"]) {
      expect(await page.locator(`${sel}[aria-invalid="true"]`).count(), `${sel} error`).toBeGreaterThan(0);
    }
  });

  test("F2-09: a light card nested in a navy band resets gold to #7E6026", async ({ page }) => {
    const link = page.getByTestId("light-in-dark").locator(".story-card-title a");
    await expect(link).toHaveCSS("color", "rgb(126, 96, 38)");
    const bandLink = page.locator('[data-surface="navy"] .story-card.surface-slate .story-card-title a');
    await expect(bandLink).toHaveCSS("color", "rgb(248, 250, 252)");
    await expect(page.locator(".site-header .site-nav a").first()).toHaveCSS("color", "rgb(197, 160, 89)");
  });

  test("F2-13: serif headings, sans text, mono figures", async ({ page }) => {
    expect(await fontProblems(page)).toEqual([]);
  });

  test("F2-14: every marked figure is tabular; an unmarked figure is caught", async ({ page }) => {
    const ok = await numericProblems(page);
    expect(ok.count).toBeGreaterThan(5);
    expect(ok.bad).toEqual([]);
    // Negative case: a figure marked data-numeric without the .numeric class.
    await page.evaluate(() => {
      const span = document.createElement("span");
      span.setAttribute("data-numeric", "");
      span.textContent = "1,234";
      document.querySelector("main")?.append(span);
    });
    expect((await numericProblems(page)).bad).toEqual(['SPAN "1,234"']);
  });

  test("F2-16: body text >= 1rem, line-height >= 1.5, prose capped at --measure", async ({ page }) => {
    const m = await page.evaluate(() => {
      const p = document.querySelector("#type .prose") as HTMLElement;
      const cs = getComputedStyle(p);
      return {
        size: parseFloat(cs.fontSize),
        lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize),
        max: cs.maxWidth,
      };
    });
    expect(m.size).toBeGreaterThanOrEqual(16);
    expect(m.lh).toBeGreaterThanOrEqual(1.5);
    expect(m.max).toMatch(/px$/);
  });

  test("F2-20: nav landmark Main with aria-current on the current link (wireframes)", async ({ page }) => {
    for (const [slug, label] of [
      ["explore", "Explore"],
      ["tools", "Tools"],
    ] as const) {
      await page.goto(`${GALLERY}design/wireframes/${slug}/`);
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("F2-22 / F2-25 / F2-28: names and labels never depend on colour", async ({ page }) => {
    for (const label of ["Fact", "Estimate", "Example", "Opinion"]) {
      expect(await page.getByRole("complementary", { name: new RegExp(`^${label}`) }).count(), label).toBe(2);
    }
    await expect(page.getByRole("complementary", { name: "Fact: With a title" })).toHaveCount(2);
    for (const label of ["Information", "Success", "Warning", "Error"]) {
      await expect(page.locator(".status-kind", { hasText: label })).toHaveCount(2);
    }
    await expect(page.locator('[data-testid="status-notice"][role]')).toHaveCount(0);
    for (const card of await page.getByTestId("story-card").all()) {
      expect(await card.locator("a, button, input, select").count()).toBe(1);
    }
  });

  test("F2-24: the refused source URL renders no link", async ({ page }) => {
    const notes = page.getByTestId("source-note");
    await expect(notes.nth(0).getByRole("link", { name: "Example official statistics" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await expect(notes.nth(1).locator("a")).toHaveCount(0);
  });

  test("F2-26: chart figure, caption, table equivalent, scroll region", async ({ page }) => {
    // Every chart (the F2 one and V1-49's story-style one) has the same structure.
    const charts = await page.getByTestId("chart").all();
    expect(charts.length).toBeGreaterThan(1);
    for (const c of charts) {
      await expect(c.locator("figcaption")).toContainText("Units:");
      await expect(c.locator("figcaption")).toContainText("Source:");
      await expect(c.locator("svg.chart-svg")).toHaveAttribute("aria-hidden", "true");
      await expect(c.getByRole("region", { name: /^Data table:/ })).toHaveAttribute("tabindex", "0");
      await expect(c.getByRole("table")).toHaveCount(1);
      expect(await c.locator("[style]").count()).toBe(0);
    }
    const chart = page.getByTestId("chart").first();
    // Numeric column headers (Profit, Cash) are right-aligned over their right-aligned figures.
    for (const name of ["Profit", "Cash"]) {
      await expect(chart.getByRole("columnheader", { name })).toHaveCSS("text-align", "right");
    }
    await expect(chart.getByRole("columnheader", { name: "Category" })).toHaveCSS("text-align", "left");
    for (const cell of await chart.locator("tbody td").all()) await expect(cell).toHaveCSS("text-align", "right");
  });

  test("F2-27: labels, describedby, aria-invalid, Error: prefix, required text, button types, no action", async ({
    page,
  }) => {
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      for (const c of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("main input, main select")) {
        if (!c.labels || c.labels.length === 0) out.push(`no label: ${c.id}`);
        for (const id of (c.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)) {
          if (!document.getElementById(id)) out.push(`describedby missing: ${id}`);
        }
        if (c.getAttribute("aria-invalid") === "true") {
          const err = document.getElementById(`${c.id}-error`);
          if (!err?.textContent?.trim().startsWith("Error:")) out.push(`no Error: prefix: ${c.id}`);
          if (!(c.getAttribute("aria-describedby") ?? "").includes(`${c.id}-error`))
            out.push(`error not linked: ${c.id}`);
        }
        if (c.required && !c.labels?.[0]?.textContent?.includes("(required)"))
          out.push(`required not in text: ${c.id}`);
      }
      for (const b of document.querySelectorAll("main button"))
        if (!b.hasAttribute("type")) out.push("button without type");
      for (const f of document.querySelectorAll("form")) if (f.hasAttribute("action")) out.push("form with action");
      return out;
    });
    expect(problems).toEqual([]);
  });

  test("F2-16: WCAG 1.4.12 text-spacing overrides cause no clipping", async ({ browser }) => {
    const context = await browser.newContext({ bypassCSP: true });
    const p = await context.newPage();
    await p.goto(GALLERY_PAGE);
    // bypassCSP is used only to inject the override stylesheet (allowed by F2-16).
    await p.addStyleTag({ content: TEXT_SPACING_CSS });
    expect(await clippingProblems(p)).toEqual([]);
    await context.close();
  });

  test("F2-32: with reduced motion, nothing transitions, animates or smooth-scrolls", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const p = await context.newPage();
    await p.goto(GALLERY_PAGE);
    const bad = await p.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.animationName !== "none") out.push(`animation ${el.tagName}`);
        if (cs.transitionDuration.split(",").some((d) => parseFloat(d) !== 0))
          out.push(`transition ${el.tagName}.${el.className}`);
      }
      if (getComputedStyle(document.documentElement).scrollBehavior !== "auto") out.push("smooth scroll");
      return out;
    });
    expect(bad).toEqual([]);
    await context.close();
  });

  test("F2-32: without reduced motion, transitions use the motion tokens (sanity)", async ({ page }) => {
    const d = await page
      .locator("button.button-primary")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(d).toBe("0.12s");
  });

  test("F2-30 / F2-37: every focus stop is visible (>= 2px, >= 3:1), unobscured, in visual order, with no trap", async ({
    page,
  }) => {
    const stops: FocusStop[] = [];
    let last = "";
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab");
      const s = await focusStop(page);
      if (!s) break;
      const key = `${s.tag}#${s.id}@${s.top},${s.left}`;
      if (key === last) break;
      if (stops.some((x) => `${x.tag}#${x.id}@${x.top},${x.left}` === key)) break; // wrapped round
      last = key;
      stops.push(s);
    }
    expect(stops.length).toBeGreaterThan(40);
    const bad = stops.filter((s) => s.outlineStyle === "none" || s.outlineWidth < 2 || s.contrast < 3 || s.obscured);
    expect(bad).toEqual([]);
    // Visual order: each stop is below the previous one, or to its right (next column/row item).
    const backwards = stops.filter((s, i) => {
      const prev = stops[i - 1];
      return prev ? s.top < prev.top - 4 && s.left <= prev.left : false;
    });
    expect(backwards).toEqual([]);
    // No trap: Tab walked all the way to the footer and then left the page; Shift+Tab comes back in.
    expect(stops.at(-1)?.inFooter).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await focusStop(page)).not.toBeNull();
  });

  test("F2-37: controls work from the keyboard (checkbox Space, select arrows, button Enter/Space)", async ({
    page,
  }) => {
    const cb = page.locator("#white-check");
    await cb.focus();
    await page.keyboard.press("Space");
    await expect(cb).toBeChecked();
    const sel = page.locator("#white-select");
    await sel.focus();
    await page.keyboard.press("ArrowDown");
    await expect(sel).not.toHaveValue("");
    const btn = page.getByRole("button", { name: "Primary", exact: true }).first();
    await btn.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(btn).toBeFocused();
    expect(page.url()).toBe(GALLERY_PAGE);
  });

  test("F2-18: reflows at 320 px and at 640 px (1280 px at 200 % zoom)", async ({ page }) => {
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(GALLERY_PAGE);
      expect(await overflowProblems(page), `${width}px`).toEqual([]);
    }
  });
});
