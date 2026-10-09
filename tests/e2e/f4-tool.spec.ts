/**
 * F4 cash-versus-profit explorer, end to end at 360, 768 and 1280 px against
 * the built site (and the gallery build for F4-51). Expected copy comes from
 * the one copy table (src/lib/cash-vs-profit/copy.ts), never re-typed here.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DISCLAIMER,
  errorCountSentence,
  errorMessage,
  FIELDS,
  FIX_ANSWERS,
  JS_NOTE,
  NOJS_NOTE,
  RESET_NOTE,
  ROUNDED_NOTE,
  TABLE_CAPTION,
} from "../../src/lib/cash-vs-profit/copy";
import { DEFAULTS } from "../../src/lib/cash-vs-profit/defaults";
import { view, type RawInputs } from "../../src/lib/cash-vs-profit/view";
import { AXE_TAGS, clippingProblems, focusStop, targetSizeProblems, TEXT_SPACING_CSS } from "../helpers/e2e-checks";
import { GALLERY_PAGE } from "../helpers/e2e-urls";

const TOOL = "tools/cash-vs-profit/";
const field = (id: string) => {
  const f = FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(`no field ${id}`);
  return f;
};
const input = (page: Page, id: string) => page.locator(`#cvp-${id}`);
const status = (page: Page) => page.locator("[data-cvp-status]");
const S3_04: RawInputs = { sales: "10,000", costs: "12,000", customerDays: "30", supplierDays: "30", opening: "5,000" };
const S3_14: RawInputs = {
  sales: "10,000,000",
  costs: "10,000,000",
  customerDays: "0",
  supplierDays: "180",
  opening: "10,000,000",
};
const ALL_ERRORS: RawInputs = { sales: "", costs: "-5", customerDays: "30.5", supplierDays: "181", opening: "1e6" };

async function open(page: Page): Promise<void> {
  await page.goto(TOOL);
  // Enhanced: the script has removed the fieldset's disabled attribute.
  await expect(page.locator("[data-cvp-fields]")).not.toHaveAttribute("disabled");
  await expect(input(page, "sales")).toBeEnabled();
}
async function fillAll(page: Page, values: RawInputs): Promise<void> {
  for (const f of FIELDS) await input(page, f.id).fill(values[f.id]);
}
const update = (page: Page) => page.getByRole("button", { name: "Update results" }).click();
const closings = (page: Page) => page.locator('[data-cvp-cell$="-closing"]').allTextContents();

/** F4-22: axe at any impact. */
async function axeAll(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test.describe("F4 explorer: results and errors", () => {
  test("F4-03 / F4-15 S3-04 typed in gives the S3 table, -£ signs and the below-zero sentence", async ({ page }) => {
    await open(page);
    await fillAll(page, S3_04);
    await update(page);
    expect(await closings(page)).toEqual(["£5,000", "£3,000", "£1,000", "-£1,000", "-£3,000", "-£5,000"]);
    const v = view(S3_04);
    expect(v.ok).toBe(true);
    if (v.ok) await expect(status(page)).toHaveText(v.summary);
    await expect(status(page)).toContainText("when it goes below zero");
  });

  const CODES: [string, string, "money" | "days", string][] = [
    ["sales", "", "money", "blank"],
    ["sales", "12abc", "money", "invalid"],
    ["sales", "1.005", "money", "decimals"],
    ["sales", "-5", "money", "negative"],
    ["sales", "10000001", "money", "overMax"],
    ["customerDays", " ", "days", "blank"],
    ["customerDays", "thirty", "days", "invalid"],
    ["customerDays", "30.5", "days", "notWhole"],
    ["customerDays", "181", "days", "daysRange"],
  ];
  for (const [id, value, kind, code] of CODES) {
    test(`F4-09 / F4-12 / F4-17 ${kind} ${code}: visible "Error:" text, aria-invalid and the accessible description, then fixed`, async ({
      page,
    }) => {
      await open(page);
      const f = field(id);
      const box = page.getByRole("textbox", { name: f.label });
      await box.fill(value);
      await update(page);
      const msg = errorMessage(kind, code, f.label);
      await expect(page.locator(`#cvp-${id}-error`)).toHaveText(`Error: ${msg}`);
      await expect(box).toHaveAttribute("aria-invalid", "true");
      await expect(box).toHaveAttribute("aria-describedby", `cvp-${id}-error cvp-${id}-hint`);
      await expect(box).toHaveAccessibleDescription(`Error: ${msg} ${f.hint}`);
      await expect(status(page)).toHaveText(errorCountSentence(1));
      const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      expect(main).not.toMatch(/NaN|Infinity|undefined/);
      await expect(page.locator("[data-cvp-table]")).toBeHidden();
      // Fix it and commit again: the error, the id and aria-invalid all go.
      await box.fill(DEFAULTS[f.id as keyof typeof DEFAULTS]);
      await box.press("Enter");
      await expect(box).not.toHaveAttribute("aria-invalid", /.*/);
      await expect(box).toHaveAttribute("aria-describedby", `cvp-${id}-hint`);
      await expect(page.locator(`#cvp-${id}-error`)).toBeHidden();
      await expect(box).toHaveAccessibleDescription(f.hint);
    });
  }

  test("F4-19 an error commit removes the last valid results from view and from the accessibility tree", async ({
    page,
  }) => {
    await open(page);
    await fillAll(page, S3_04);
    await update(page);
    await expect(page.locator("[data-cvp-table]")).toBeVisible();
    await input(page, "costs").fill("-1");
    await update(page);
    await expect(page.locator("[data-cvp-table]")).toBeHidden();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.locator("[data-cvp-fix]")).toHaveText(FIX_ANSWERS);
    await expect(status(page)).toHaveText(errorCountSentence(1));
    const snapshot = await page.locator("[data-testid=explorer-results]").ariaSnapshot();
    expect(snapshot).not.toMatch(/£\d/);
  });

  test("F4-14 committing never rewrites what was typed, and figures are rounded once", async ({ page }) => {
    await open(page);
    await input(page, "sales").fill("20000");
    await input(page, "sales").press("Enter");
    await expect(input(page, "sales")).toHaveValue("20000");
    await expect(page.getByText(ROUNDED_NOTE)).toBeVisible();
  });

  test("F4-18 one live region; typing changes nothing, each commit (Enter, change, button, reset) writes it once", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('[role="status"]')).toHaveCount(1);
    await page.evaluate(() => {
      const w = window as unknown as { __mutations: number };
      w.__mutations = 0;
      const el = document.querySelector("[data-cvp-status]");
      if (!el) throw new Error("no status");
      new MutationObserver((records) => {
        w.__mutations += records.length > 0 ? 1 : 0;
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const count = () => page.evaluate(() => (window as unknown as { __mutations: number }).__mutations);
    const settle = () => page.waitForTimeout(150);
    await input(page, "sales").click();
    await input(page, "sales").fill("");
    await settle();
    const afterClear = await count();
    await input(page, "sales").pressSequentially("12345");
    await settle();
    expect(await count(), "typing changes the live region").toBe(afterClear);
    await input(page, "sales").press("Enter");
    await settle();
    expect(await count(), "Enter").toBe(afterClear + 1);
    // Enter is an explicit commit (D-2): pressed again with nothing changed, it still commits once.
    // (Chrome fires change on Enter only when the value changed, so this needs the Enter handler.)
    await input(page, "sales").press("Enter");
    await settle();
    expect(await count(), "Enter, unchanged").toBe(afterClear + 2);
    await page.keyboard.press("Tab"); // blur after Enter: the change event mustn't announce again
    await settle();
    expect(await count(), "blur after Enter").toBe(afterClear + 2);
    await input(page, "costs").fill("1000");
    await page.keyboard.press("Tab"); // change
    await settle();
    expect(await count(), "change").toBe(afterClear + 3);
    await update(page);
    await settle();
    expect(await count(), "button").toBe(afterClear + 4);
    await page.getByRole("button", { name: "Reset" }).click();
    await settle();
    expect(await count(), "reset").toBe(afterClear + 5);
    const v = view(DEFAULTS);
    if (v.ok) await expect(status(page)).toHaveText(`${RESET_NOTE} ${v.summary}`);
    for (const f of FIELDS) await expect(input(page, f.id)).toHaveValue(DEFAULTS[f.id]);
  });

  test("F4-20 tab order, Enter commits, no trap, focus never moved, visible focus and 24 px targets", async ({
    page,
  }) => {
    await open(page);
    await input(page, "sales").focus();
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.id || el?.getAttribute("data-action") || el?.getAttribute("role") || el?.tagName || "";
        }),
      );
      const stop = await focusStop(page);
      expect(stop?.outlineWidth ?? 0, order.at(-1)).toBeGreaterThan(0);
      expect(stop?.outlineStyle, order.at(-1)).not.toBe("none");
      expect(stop?.contrast ?? 0, order.at(-1)).toBeGreaterThanOrEqual(3);
      expect(stop?.obscured, order.at(-1)).toBe(false);
      await page.keyboard.press("Tab");
    }
    expect(order).toEqual([
      "cvp-sales",
      "cvp-costs",
      "cvp-customerDays",
      "cvp-supplierDays",
      "cvp-opening",
      "update",
      "reset",
      "region",
    ]);
    // Out of the explorer forwards and back in with Shift+Tab.
    const outside = await page.evaluate(() => !document.activeElement?.closest("[data-cvp]"));
    expect(outside).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".explorer-table")).toBeFocused();
    for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !document.activeElement?.closest("[data-cvp]"))).toBe(true);
    // Commits never move focus.
    await input(page, "costs").fill("-1");
    await input(page, "costs").press("Enter");
    await expect(input(page, "costs")).toBeFocused();
    await page.getByRole("button", { name: "Update results" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Update results" })).toBeFocused();
    await page.getByRole("button", { name: "Reset" }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Reset" })).toBeFocused();
    expect(await targetSizeProblems(page)).toEqual([]);
  });

  test("F4-21 a captioned table with column and row headers, right-aligned tabular figures, in a labelled region", async ({
    page,
  }) => {
    await open(page);
    const region = page.getByRole("region", { name: TABLE_CAPTION });
    await expect(region).toHaveAttribute("tabindex", "0");
    await expect(region.getByRole("columnheader")).toHaveCount(5);
    await expect(region.getByRole("rowheader")).toHaveCount(6);
    const cell = page.locator('[data-cvp-cell="2-closing"]');
    expect(
      await cell.evaluate((el) => [getComputedStyle(el).textAlign, getComputedStyle(el).fontVariantNumeric]),
    ).toEqual(["right", "tabular-nums"]);
  });
});

test.describe("F4-22 axe at every impact", () => {
  test("F4-22 default, after a valid commit, every field in error, after reset", async ({ page }) => {
    await open(page);
    expect(await axeAll(page), "default").toEqual([]);
    await fillAll(page, S3_04);
    await update(page);
    expect(await axeAll(page), "valid commit").toEqual([]);
    await fillAll(page, ALL_ERRORS);
    await update(page);
    await expect(status(page)).toHaveText(errorCountSentence(5));
    expect(await axeAll(page), "all errors").toEqual([]);
    await page.getByRole("button", { name: "Reset" }).click();
    expect(await axeAll(page), "reset").toEqual([]);
  });
  test("F4-22 / F4-58 the gallery explorer variants", async ({ page }) => {
    await page.goto(GALLERY_PAGE);
    const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).include("#explorer").analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
  });
});

test.describe("F4-23 reflow and text spacing", () => {
  test.use({ bypassCSP: true });
  test("F4-23 at 320 px nothing scrolls sideways but the table region; with WCAG text spacing nothing is clipped", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await fillAll(page, ALL_ERRORS);
    await update(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    expect(await clippingProblems(page)).toEqual([]);
    await fillAll(page, ALL_ERRORS);
    await update(page);
    expect(await clippingProblems(page)).toEqual([]);
  });
});

test.describe("F4-25 to F4-27 / F4-33 nothing leaves or stays", () => {
  test("F4-25 / F4-26 / F4-33 no request, navigation, storage, cookie, URL change, style attribute or CSP violation", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    const consoleCsp: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) consoleCsp.push(m.text());
    });
    await open(page);
    await page.waitForLoadState("load");
    const requests: string[] = [];
    const navigations: string[] = [];
    page.on("request", (r) => requests.push(`${r.resourceType()} ${r.url()}`));
    page.on("framenavigated", (f) => navigations.push(f.url()));
    const before = await page.evaluate(() => [location.href, history.length]);
    const vectors = [
      DEFAULTS,
      S3_04,
      S3_14,
      ALL_ERRORS,
      { sales: "9".repeat(400), costs: "1e309", customerDays: "-1", supplierDays: "Infinity", opening: "١٢" },
      { sales: "0.29", costs: "£ 20,000", customerDays: "007", supplierDays: "180", opening: "\u00a020000\u00a0" },
    ] as RawInputs[];
    for (const v of vectors) {
      await fillAll(page, v);
      await input(page, "opening").press("Enter");
      await fillAll(page, v);
      await page.keyboard.press("Tab");
      await update(page);
    }
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
    expect(navigations).toEqual([]);
    const after = await page.evaluate(async () => ({
      href: location.href,
      history: history.length,
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      idb: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
      sw: (await navigator.serviceWorker.getRegistrations()).length,
      styled: document.querySelectorAll("[style]").length,
      csp: (window as unknown as { __csp: string[] }).__csp,
    }));
    expect(after).toEqual({
      href: before[0],
      history: before[1],
      local: 0,
      session: 0,
      cookie: "",
      idb: 0,
      caches: 0,
      sw: 0,
      styled: 0,
      csp: [],
    });
    expect(new URL(String(after.href)).search + new URL(String(after.href)).hash).toBe("");
    expect(consoleCsp).toEqual([]);
  });
});

test.describe("F4-35 / F4-37 JavaScript off", () => {
  test.use({ javaScriptEnabled: false });
  test("F4-35 the page is complete: summary, how it works, assumptions, limitations, notices and the S3-01 example", async ({
    page,
  }) => {
    await page.goto(TOOL);
    expect(await page.locator("[data-cvp-fields]").getAttribute("disabled"), "fieldset disabled").not.toBeNull();
    await expect(input(page, "sales")).toBeDisabled();
    await expect(page.locator("[data-cvp-note]")).toHaveText(NOJS_NOTE);
    for (const id of ["how-it-works", "assumptions", "limitations", "illustrative-only"]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.getByTestId("explorer-disclaimer")).toHaveText(DISCLAIMER);
    expect(await closings(page)).toEqual(["£10,000", "-£5,000", "£0", "£5,000", "£10,000", "£15,000"]);
    const v = view(DEFAULTS);
    if (v.ok) await expect(status(page)).toHaveText(v.summary);
    // axe needs JavaScript; the JavaScript-off state is checked by axe in F4-38 (module request aborted, same DOM).
  });

  test("F4-37 with the fieldset forced on, Enter and both buttons change no URL and make no request", async ({
    page,
  }) => {
    await page.route(`**/${TOOL}`, async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(
        '<fieldset class="explorer-fields" disabled',
        '<fieldset class="explorer-fields"',
      );
      await route.fulfill({ response: res, body });
    });
    await page.goto(TOOL);
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);
    const url = page.url();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await expect(page.locator("[data-cvp-fields]")).not.toHaveAttribute("disabled");
    await input(page, "sales").fill("123");
    await input(page, "sales").press("Enter");
    await page.getByRole("button", { name: "Update results" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    expect(requests).toEqual([]);
  });
});

test.describe("F4-36 / F4-38 progressive enhancement", () => {
  test("F4-36 enhancement swaps the note in place, leaves the results HTML unchanged and adds no layout shift", async ({
    page,
    browser,
  }) => {
    test.slow(); // several contexts and navigations; slow on a loaded runner
    const baseURL = test.info().project.use.baseURL ?? "";
    const off = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() ?? null, baseURL });
    const offPage = await off.newPage();
    await offPage.goto(TOOL);
    await offPage.waitForLoadState("networkidle");
    const offResults = await offPage.locator("[data-testid=explorer-results]").innerHTML();
    const offHeight = (await offPage.locator("[data-cvp]").boundingBox())?.height;
    await off.close();
    // The web fonts swap in (font-display: swap; budgeted in layout-shift.spec.ts) on a cold
    // cache, which shifts header text on every page. A first visit warms the cache, so the
    // measured navigation shows only what this page and its script do.
    await page.goto(TOOL);
    await page.evaluate(() => document.fonts.ready);
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: string[] };
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources: { node?: Node | null }[];
        }[]) {
          if (!e.hadRecentInput) {
            w.__shifts.push(`${e.value} ${e.sources.map((x) => x.node?.parentElement?.className ?? "?").join(",")}`);
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(TOOL);
    await open(page);
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-cvp-note]")).toHaveText(JS_NOTE);
    expect(await page.locator("[data-testid=explorer-results]").innerHTML()).toBe(offResults);
    expect((await page.locator("[data-cvp]").boundingBox())?.height, "explorer height, JS off vs on").toBe(offHeight);
    expect(await page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts)).toEqual([]);
  });

  test("F4-38 a failed script leaves the JavaScript-off page, axe clean, with only the failed load in the console", async ({
    page,
  }) => {
    test.slow(); // several contexts and navigations; slow on a loaded runner
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/\/_astro\/.*\.js$/, (r) => r.abort());
    await page.goto(TOOL);
    await page.waitForLoadState("load");
    expect(await page.locator("[data-cvp-fields]").getAttribute("disabled"), "fieldset disabled").not.toBeNull();
    await expect(input(page, "sales")).toBeDisabled();
    await expect(page.locator("[data-cvp-note]")).toHaveText(NOJS_NOTE);
    expect(await axeAll(page)).toEqual([]);
    expect(
      errors.every((e) => /Failed to load resource|net::ERR_FAILED/.test(e)),
      errors.join("\n"),
    ).toBe(true);
  });
});

test.describe("F4-47 / F4-36 the web-font swap moves nothing on the tool page", () => {
  // Lighthouse's mobile emulation. The notice sat on a line-break boundary at 412 px, so the
  // swap from the metric-matched fallback added a line and moved the explorer (CLS 0.0056).
  test.use({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  test("F4-47 the explorer starts at the same place before and after the web fonts swap in (412 px, fonts held back)", async ({
    page,
  }) => {
    // Lighthouse CI is the CLS judge (0 on this page, F4-47). This is the deterministic part: everything
    // above the explorer keeps its height through the swap, so the explorer never moves. The header's
    // sub-pixel swap residue (~0.0003, on every page) is covered by layout-shift.spec.ts.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\.woff2(\?|$)/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(TOOL, { waitUntil: "domcontentloaded" });
    const top = () => page.evaluate(() => document.querySelector("[data-cvp]")?.getBoundingClientRect().top ?? -1);
    const before = await top();
    release();
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").length;
    });
    expect(loaded, "the web fonts loaded, so the swap was measured").toBeGreaterThan(0);
    await page.waitForTimeout(200);
    expect(await top()).toBeCloseTo(before, 0);
  });
});

test.describe("F4-50 commits are cheap", () => {
  test("F4-50 with 4x CPU throttling, committing S3-14 makes no long task over 50 ms", async ({ page }) => {
    await open(page);
    // Type the values unthrottled; the measured window is the S3-14 commit itself.
    await fillAll(page, S3_14);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask" });
    });
    await update(page);
    await expect(page.locator('[data-cvp-cell="6-closing"]')).toHaveText("£70,000,000");
    await page.waitForTimeout(300);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(long.filter((d) => d > 50)).toEqual([]);
  });
});

test.describe("F4-53 topic tools card", () => {
  test("F4-53 the topic card shows the decorative tool icon before a link named by the tool title", async ({
    page,
  }) => {
    await page.goto("topics/understand-the-numbers/");
    const card = page.getByTestId("topic-tool");
    await expect(card.locator("svg.icon[data-icon=cash-vs-profit]")).toBeVisible();
    await expect(card.getByRole("link")).toHaveAccessibleName("Cash-versus-profit explorer");
    const box = await card.locator("svg.icon").boundingBox();
    const link = await card.getByRole("link").boundingBox();
    expect((box?.x ?? 0) < (link?.x ?? 0)).toBe(true);
  });
});

/** F4-51: effective label size (computed font-size × the SVG's on-screen scale), overlaps and overflow. */
function chartLabels(page: Page): Promise<{ sizes: number[]; problems: string[] }> {
  return page.evaluate(() => {
    const sizes: number[] = [];
    const problems: string[] = [];
    for (const svg of document.querySelectorAll<SVGSVGElement>(".chart svg.chart-svg")) {
      const scale = svg.getScreenCTM()?.a ?? 0;
      const box = svg.getBoundingClientRect();
      const labels = [...svg.querySelectorAll<SVGTextElement>(".chart-value, .chart-category")];
      const rects = labels.map((t) => t.getBoundingClientRect());
      labels.forEach((t, i) => {
        sizes.push(parseFloat(getComputedStyle(t).fontSize) * scale);
        const r = rects[i];
        if (!r) return;
        if (
          r.left < box.left - 0.5 ||
          r.right > box.right + 0.5 ||
          r.top < box.top - 0.5 ||
          r.bottom > box.bottom + 0.5
        ) {
          problems.push(`"${t.textContent}" overflows the SVG`);
        }
        rects.slice(i + 1).forEach((o, j) => {
          if (r.left < o.right && o.left < r.right && r.top < o.bottom && o.top < r.bottom) {
            problems.push(`"${t.textContent}" overlaps "${labels[i + 1 + j]?.textContent}"`);
          }
        });
      });
    }
    return { sizes, problems };
  });
}

const CHART_PAGES = ["stories/why-profit-isnt-cash/", "stories/what-is-working-capital/", GALLERY_PAGE];
const BAND: [number, number, number][] = [
  [320, 9, Number.POSITIVE_INFINITY],
  [360, 9, Number.POSITIVE_INFINITY],
  [768, 9, 16],
  [1280, 9, 16],
];

test.describe("F4-51 chart labels scale with the page", () => {
  test("F4-51 labels are >= 9 px at 320/360 and 9-16 px at 768/1280 on both chart stories and the gallery, without overlap or overflow", async ({
    page,
  }) => {
    const measured: string[] = [];
    for (const [width, min, max] of BAND) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of CHART_PAGES) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const { sizes, problems } = await chartLabels(page);
        expect(sizes.length, `${path} at ${width}`).toBeGreaterThan(0);
        expect(problems, `${path} at ${width}`).toEqual([]);
        const lo = Math.min(...sizes);
        const hi = Math.max(...sizes);
        measured.push(
          `${width}px ${path.replace(/^http.*\/belvoir-finance\//, "")}: ${lo.toFixed(2)}-${hi.toFixed(2)} px`,
        );
        expect(lo, `${path} at ${width}`).toBeGreaterThanOrEqual(min);
        expect(hi, `${path} at ${width}`).toBeLessThanOrEqual(max);
      }
    }
    console.info(`F4-51 effective label sizes (${test.info().project.name}):\n${measured.join("\n")}`);
  });

  test.describe("negative check", () => {
    test.use({ bypassCSP: true });
    test("F4-51 (M-37) the 5fdc80e rule (fixed 9 px in SVG units) fails the same measurement", async ({ page }) => {
      const failures: string[] = [];
      for (const [width, min, max] of BAND) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(CHART_PAGES[0] ?? "");
        // bypassCSP only so this test stylesheet can be added.
        await page.addStyleTag({ content: ".chart-value, .chart-category { font-size: 9px !important; }" });
        const { sizes } = await chartLabels(page);
        const lo = Math.min(...sizes);
        const hi = Math.max(...sizes);
        if (lo < min || hi > max) failures.push(`${width}: ${lo.toFixed(2)}-${hi.toFixed(2)}`);
      }
      expect(failures.map((f) => f.split(":")[0])).toEqual(["320", "360", "768", "1280"]);
    });
  });
});

/* ---------------------------------------------------------------- F4-15 negatives never split */

/** A loss-making case with long amounts, so "-£10,000,000"-sized values meet the 320 px line ends. */
const BIG_LOSS: RawInputs = { sales: "1", costs: "10,000,000", customerDays: "180", supplierDays: "0", opening: "0" };

/**
 * F4-15: every negative amount ("-£…") in an explorer's summary and table, with the number of
 * line boxes its text occupies. Ranges are built from text offsets, so the measurement doesn't
 * depend on the markup it checks (a "-" left at a line end shows as 2 lines).
 */
function negativeAmountLines(page: Page, root: string): Promise<{ text: string; lines: number }[]> {
  return page.evaluate((rootSel) => {
    const out: { text: string; lines: number }[] = [];
    const scope = document.querySelector(rootSel);
    if (!scope) return out;
    const hosts = [...scope.querySelectorAll("[data-cvp-status], [data-cvp-cell]")];
    for (const host of hosts) {
      const nodes: { node: Text; start: number }[] = [];
      let all = "";
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        nodes.push({ node: n as Text, start: all.length });
        all += n.nodeValue ?? "";
      }
      const at = (offset: number, end: boolean) => {
        const hit = nodes.find((x) => {
          const len = x.node.nodeValue?.length ?? 0;
          return end ? offset > x.start && offset <= x.start + len : offset >= x.start && offset < x.start + len;
        });
        if (!hit) throw new Error(`no text at ${offset}`);
        return { node: hit.node, offset: offset - hit.start };
      };
      for (const m of all.matchAll(/-£[\d,]+/g)) {
        const range = document.createRange();
        const s = at(m.index, false);
        const e = at(m.index + m[0].length, true);
        range.setStart(s.node, s.offset);
        range.setEnd(e.node, e.offset);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        out.push({ text: m[0], lines: tops.size });
      }
    }
    return out;
  }, root);
}

test.describe("F4-15 a negative amount never wraps after its minus sign", () => {
  const WIDTHS = [320, 360];
  const CASES: [string, (page: Page) => Promise<string>][] = [
    [
      "tool page, S3-04",
      async (page) => {
        await open(page);
        await fillAll(page, S3_04);
        await update(page);
        return "[data-cvp]";
      },
    ],
    [
      "tool page, a large loss",
      async (page) => {
        await open(page);
        await fillAll(page, BIG_LOSS);
        await update(page);
        return "[data-cvp]";
      },
    ],
    [
      "gallery loss variant (server-rendered)",
      async (page) => {
        await page.goto(GALLERY_PAGE);
        return '[data-cvp="g-negative"]';
      },
    ],
  ];

  async function measure(page: Page): Promise<{ count: number; split: string[] }> {
    let count = 0;
    const split: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, load] of CASES) {
        const root = await load(page);
        const amounts = await negativeAmountLines(page, root);
        count += amounts.length;
        for (const a of amounts) if (a.lines !== 1) split.push(`${width} px, ${name}: ${a.text} on ${a.lines} lines`);
      }
    }
    return { count, split };
  }

  test("F4-15 at 320 and 360 px each negative amount in the summary and table sits on one line", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "sets its own 320 and 360 px viewports");
    const { count, split } = await measure(page);
    expect(count).toBeGreaterThan(30);
    expect(split).toEqual([]);
  });

  test.describe("negative check", () => {
    test.use({ bypassCSP: true });
    test("F4-15 with the money values allowed to wrap, the same measurement finds a split amount", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile-360", "sets its own 320 and 360 px viewports");
      // bypassCSP only so this test stylesheet can be added, on every page measure() loads.
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = ".money { white-space: normal !important; }";
          document.head.append(s);
        });
      });
      const { split } = await measure(page);
      expect(split.length).toBeGreaterThan(0);
    });
  });
});
