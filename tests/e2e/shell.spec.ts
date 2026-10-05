import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { fontProblems, overflowProblems, renderedGoldProblems, targetSizeProblems } from "../helpers/e2e-checks";
import { sitePaths } from "../helpers/e2e-pages";

// F3-35 / F3-36 / F3-37: every built page (derived from the content), plus the 404.
const PAGES = sitePaths();

for (const path of PAGES) {
  test.describe(`page shell: /${path}`, () => {
    test("F1-26: zero serious or critical axe violations (WCAG 2.2 AA)", async ({ page }) => {
      const cspErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
      });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      // All content sits inside a landmark (axe "region", moderate impact).
      expect(results.violations.filter((v) => v.id === "region").map((v) => v.nodes.length)).toEqual([]);
      expect(cspErrors, "no CSP violations in the console").toEqual([]);
    });

    test("F1-26: lang, skip link, one h1, landmarks, no horizontal scroll", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content" });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  });
}

// ---------------------------------------------------------------- F2 on the built site (dist/)

for (const path of PAGES) {
  test.describe(`F2 on /${path}`, () => {
    test("F2-09 / F2-18 / F2-19 / F2-29: gold rule, overflow, target size, not-advice aside", async ({ page }) => {
      await page.goto(path);
      expect(await renderedGoldProblems(page)).toEqual([]);
      expect(await overflowProblems(page)).toEqual([]);
      expect(await targetSizeProblems(page)).toEqual([]);
      const notice = page.getByRole("complementary", { name: "Not financial advice" });
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute("data-testid", "not-advice-notice");
    });

    test("F2-13: serif headings, sans text, mono figures", async ({ page }) => {
      await page.goto(path);
      expect(await fontProblems(page)).toEqual([]);
    });

    test("F2-21: one slate contentinfo with the not-advice text and a link list; no forbidden claims", async ({
      page,
    }) => {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      await expect(footer).toHaveCount(1);
      await expect(footer).toHaveClass(/surface-slate/);
      await expect(footer).toHaveCSS("background-color", "rgb(28, 37, 65)");
      await expect(footer).toContainText("Educational information, not financial advice.");
      expect(await footer.getByRole("navigation", { name: "Footer" }).getByRole("link").count()).toBeGreaterThan(0);
      const text = (await footer.textContent()) ?? "";
      expect(text).not.toMatch(/work with belvoir|regulated by|authorised by|FCA|certified|testimonial|£\s?\d/i);
    });
  });
}

test.describe("F2-20 / F3-03 navigation", () => {
  for (const [path, label] of [
    ["./", "Home"],
    ["explore/", "Explore"],
    ["tools/", "Tools"],
    ["sources/", "Sources"],
  ] as const) {
    test(`aria-current="page" on ${label} at /${path}`, async ({ page }) => {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav).toHaveCount(1);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: /work with belvoir/i })).toHaveCount(0);
    });
  }

  test("nav links follow the skip link and brand in keyboard order", async ({ page }) => {
    await page.goto("./");
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      order.push((await page.evaluate(() => document.activeElement?.textContent?.trim())) ?? "");
    }
    expect(order).toEqual(["Skip to main content", "Belvoir Finance", "Home", "Explore"]);
  });

  test("F3-03 the main nav is Home, Explore, Tools, Sources; aria-current only on those four pages", async ({
    page,
  }) => {
    const navPages = new Set(["./", "explore/", "tools/", "sources/"]);
    for (const path of PAGES) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link")).toHaveText(["Home", "Explore", "Tools", "Sources"]);
      await expect(nav.locator('[aria-current="page"]'), path).toHaveCount(navPages.has(path) ? 1 : 0);
      await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link")).toHaveText([
        "About",
        "Editorial standards",
        "Newsletter",
        "Contact",
        "Privacy",
        "Cookies",
        "Terms",
      ]);
    }
  });
});

test.describe("F2-23 article header on the demo story", () => {
  test("one h1, byline, Reviewed by, en-GB dates", async ({ page }) => {
    await page.goto("stories/why-profit-isnt-cash/");
    const header = page.getByTestId("article-header");
    await expect(header.locator("h1")).toHaveCount(1);
    await expect(header).toContainText("Placeholder Author");
    await expect(header).toContainText("Reviewed by");
    await expect(header.locator('time[datetime="2026-10-02"]').first()).toHaveText("2 October 2026");
    await expect(page.getByTestId("jurisdiction-label")).toHaveCount(0);
  });
});

test.describe("Favicon: no request to the root /favicon.ico", () => {
  test("the home page loads the base-aware icon and makes no failed or root-favicon request", async ({ page }) => {
    const failed: string[] = [];
    const rootIcon: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    page.on("request", (r) => {
      if (/^http:\/\/127\.0\.0\.1:4321\/favicon/.test(r.url())) rootIcon.push(r.url());
    });
    await page.goto("./");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/belvoir-finance/favicon.svg");
    const icon = await page.request.get("/belvoir-finance/favicon.svg");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/svg+xml");
    expect(failed).toEqual([]);
    expect(rootIcon).toEqual([]);
  });
});
