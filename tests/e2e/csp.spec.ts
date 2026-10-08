/**
 * F4-34 / Aegis Q-9 in the browser: every built page (site and gallery build)
 * runs under connect-src 'none' and require-trusted-types-for 'script' with no
 * Trusted Types policy, and raises zero securitypolicyviolation events, zero
 * CSP console errors and zero page errors, including the explorer through its
 * whole interaction set. Negative controls show the checks would catch a real
 * string sink and that fetch, XHR, beacon, WebSocket and EventSource are blocked.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { FIELDS } from "../../src/lib/cash-vs-profit/copy";
import type { RawInputs } from "../../src/lib/cash-vs-profit/view";
import { collectCspErrors } from "../helpers/e2e-checks";
import { sitePaths } from "../helpers/e2e-pages";
import { GALLERY, GALLERY_PAGE, SITE, WIREFRAME_SLUGS } from "../helpers/e2e-urls";

type Violation = { directive: string; blocked: string; sample: string; source: string; line: number };
declare global {
  interface Window {
    __cspViolations: Violation[];
    __sinkStarted?: boolean;
    __sinkFinished?: boolean;
    trustedTypes?: { defaultPolicy: unknown };
  }
}

const TOOL = "tools/cash-vs-profit/";
const TOOL_MODULE = "**/_astro/CashVsProfitScript*.js";
const SINK_FIXTURE = readFileSync("tests/fixtures/f4/csp/innerhtml-sink.js.fixture", "utf8");

/** Records every CSP violation (meta CSP, TT and connect-src) from document start, plus console and page errors. */
async function watch(
  page: Page,
): Promise<{ csp: string[]; pageErrors: string[]; violations: () => Promise<Violation[]> }> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    window.addEventListener(
      "securitypolicyviolation",
      (e) =>
        window.__cspViolations.push({
          directive: e.effectiveDirective || e.violatedDirective,
          blocked: e.blockedURI,
          sample: e.sample,
          source: e.sourceFile,
          line: e.lineNumber,
        }),
      true,
    );
  });
  const csp = collectCspErrors(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  return { csp, pageErrors, violations: () => page.evaluate(() => window.__cspViolations) };
}
/** Lets late, asynchronously reported violations arrive. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 150))));
const input = (page: Page, id: string) => page.locator(`#cvp-${id}`);

const PAGES = [
  ...sitePaths().map((p) => `${SITE}${p}`),
  GALLERY_PAGE,
  ...WIREFRAME_SLUGS.map((s) => `${GALLERY}design/wireframes/${s}/`),
];

test.describe("F4-34 (Q-9) every built page runs clean under the site CSP", () => {
  for (const url of PAGES) {
    test(`no CSP violation, CSP console error or page error: ${url.replace(/^http:\/\/[^/]+/, "")}`, async ({
      page,
    }) => {
      const w = await watch(page);
      await page.goto(url, { waitUntil: "load" });
      await settle(page);
      expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")).toContain(
        "require-trusted-types-for 'script'",
      );
      expect(await w.violations()).toEqual([]);
      expect(w.csp).toEqual([]);
      expect(w.pageErrors).toEqual([]);
    });
  }
});

test.describe("F4-34 (Q-9) the explorer under Trusted Types and connect-src 'none'", () => {
  test("change values, Enter, Update, every error state and Reset raise no violation", async ({ page }) => {
    const w = await watch(page);
    await page.goto(TOOL);
    await expect(page.locator("[data-cvp-fields]")).not.toHaveAttribute("disabled");
    const status = page.locator("[data-cvp-status]");
    const before = await status.textContent();

    // change (blur) commits
    await input(page, "sales").fill("10,000");
    await input(page, "costs").fill("12,000");
    await input(page, "costs").blur();
    // Enter commits
    await input(page, "customerDays").fill("45");
    await input(page, "customerDays").press("Enter");
    // Update commits
    await input(page, "opening").fill("5,000");
    await page.getByRole("button", { name: "Update results" }).click();
    await expect(status).not.toHaveText(before ?? "");

    // every field in error at once, then each field's error alone
    const bad: RawInputs = {
      sales: "",
      costs: "-5",
      customerDays: "30.5",
      supplierDays: "181",
      opening: "1e6",
    };
    for (const f of FIELDS) await input(page, f.id).fill(bad[f.id]);
    await page.getByRole("button", { name: "Update results" }).click();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(FIELDS.length);
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    for (const f of FIELDS) {
      await input(page, f.id).fill(bad[f.id]);
      await input(page, f.id).press("Enter");
      await expect(input(page, f.id)).toHaveAttribute("aria-invalid", "true");
      await page.getByRole("button", { name: "Reset" }).click();
    }
    await settle(page);
    expect(await w.violations()).toEqual([]);
    expect(w.csp).toEqual([]);
    expect(w.pageErrors).toEqual([]);
    // Trusted Types is enforced on this page and no policy exists, not even a default one,
    // so the explorer ran all of the above without any string sink.
    expect(await page.evaluate(() => window.trustedTypes?.defaultPolicy)).toBeNull();
    expect(
      await page.evaluate(() => {
        try {
          document.createElement("div").innerHTML = "x";
          return "allowed";
        } catch (e) {
          return (e as Error).name;
        }
      }),
    ).toBe("TypeError");
  });

  test("negative: a deliberate innerHTML = string sink in the tool module is blocked by Trusted Types", async ({
    page,
  }) => {
    const w = await watch(page);
    await page.route(TOOL_MODULE, (r) => r.fulfill({ contentType: "text/javascript", body: SINK_FIXTURE }));
    await page.goto(TOOL);
    await expect.poll(() => page.evaluate(() => window.__sinkStarted === true)).toBe(true);
    await settle(page);
    expect(await page.evaluate(() => window.__sinkFinished)).toBeUndefined();
    expect(await page.locator("[data-cvp-status] b").count()).toBe(0);
    const v = await w.violations();
    expect(v.map((x) => x.directive)).toContain("require-trusted-types-for");
    expect(w.pageErrors.join(" | ")).toMatch(/TrustedHTML/);
  });

  test("negative: a string sink from page script throws, on every sink kind", async ({ page }) => {
    const w = await watch(page);
    await page.goto(TOOL);
    const thrown = await page.evaluate(() => {
      const el = document.createElement("div");
      const tries: [string, () => void][] = [
        ["innerHTML", () => (el.innerHTML = "<b>x</b>")],
        ["outerHTML", () => (document.body.appendChild(el).outerHTML = "<i>x</i>")],
        ["insertAdjacentHTML", () => document.body.insertAdjacentHTML("beforeend", "<b>x</b>")],
        ["script.src", () => (document.createElement("script").src = "data:text/javascript,1")],
      ];
      return tries.map(([name, fn]) => {
        try {
          fn();
          return `${name}: allowed`;
        } catch (e) {
          return `${name}: ${(e as Error).name}`;
        }
      });
    });
    expect(thrown).toEqual([
      "innerHTML: TypeError",
      "outerHTML: TypeError",
      "insertAdjacentHTML: TypeError",
      "script.src: TypeError",
    ]);
    await settle(page);
    expect((await w.violations()).filter((x) => x.directive === "require-trusted-types-for")).toHaveLength(4);
  });
});

test.describe("F4-34 (Q-9) connect-src 'none' blocks every script connection", () => {
  test("fetch, XHR, sendBeacon, WebSocket and EventSource are blocked before the network; an allowed image load is the control", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "one viewport is enough for a network probe");
    const hits: string[] = [];
    await page.route("**/q9-probe/**", (r) => {
      hits.push(new URL(r.request().url()).pathname);
      return r.fulfill({ status: 204, body: "" });
    });
    const w = await watch(page);
    await page.goto(TOOL);
    const results = await page.evaluate(async () => {
      const out: Record<string, string> = {};
      try {
        await fetch("q9-probe/fetch");
        out.fetch = "resolved";
      } catch (e) {
        out.fetch = (e as Error).name;
      }
      out.xhr = await new Promise<string>((resolve) => {
        const x = new XMLHttpRequest();
        x.onload = () => resolve("loaded");
        x.onerror = () => resolve("error");
        try {
          x.open("GET", "q9-probe/xhr");
          x.send();
        } catch (e) {
          resolve((e as Error).name);
        }
      });
      try {
        navigator.sendBeacon("q9-probe/beacon", "x");
        out.beacon = "called";
      } catch (e) {
        out.beacon = (e as Error).name;
      }
      out.websocket = await new Promise<string>((resolve) => {
        try {
          const ws = new WebSocket(`ws://${location.host}/q9-probe/ws`);
          ws.onopen = () => resolve("open");
          ws.onerror = () => resolve("error");
        } catch (e) {
          resolve((e as Error).name);
        }
      });
      out.eventsource = await new Promise<string>((resolve) => {
        const es = new EventSource("q9-probe/sse");
        es.onopen = () => resolve("open");
        es.onerror = () => {
          es.close();
          resolve("error");
        };
      });
      // Control: img-src 'self' is allowed, so this one must reach the route.
      out.img = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve("requested");
        img.src = "q9-probe/img";
      });
      return out;
    });
    await settle(page);
    expect(results.fetch).toBe("TypeError");
    expect(results.xhr).toBe("error");
    expect(["error", "SecurityError"]).toContain(results.websocket);
    expect(results.eventsource).toBe("error");
    const blocked = (await w.violations()).filter((v) => v.directive === "connect-src").map((v) => v.blocked);
    for (const kind of ["fetch", "xhr", "beacon", "sse"]) expect(blocked.join(" "), kind).toContain(`q9-probe/${kind}`);
    expect(blocked.join(" "), "websocket").toMatch(/ws:\/\/[^ ]*(q9-probe\/ws)?/);
    expect(hits.sort()).toEqual(["/belvoir-finance/tools/cash-vs-profit/q9-probe/img"]);
  });
});
