# Acceptance criteria: V2 visual and UX refresh with motion

**Task:** V2, Francis's request of 23 Oct 2026 for a refresh in the style of amadae.co (style only), as specified in `docs/design/V2_BRIEF.md` (PR #44, `8c90629`, on `main` `f12a177`).
**Verifier:** Sentinel. **Also checked by:** Aegis (CSP, fonts, SVG, reference assets: V2-01 to V2-14), Launchpad (CSS pin, Lighthouse, visual gate: V2-40 to V2-49), Atlas (design fit, open questions).
**Status:** Draft v0.1 (23 Oct 2026). Written from the brief at `8c90629` and Forge's implementation notes (input only; where the notes and the brief disagree, **the brief wins**, see Q-V2-1). Follows `AC_F2_DESIGN_SYSTEM.md`, `AC_F3_PAGES.md`, `AC_F4_TOOL.md`, `AC_V1_VISUAL.md`, `TEST_STRATEGY.md` and `AGENTS.md`.

Check types and evidence are as in `AC_F4_TOOL.md`:

- **Unit:** Vitest, merge-blocking. Evidence: test name and CI run link.
- **Build:** assertion on `dist/` in `tests/build/`, merge-blocking. Evidence: test name and CI run link.
- **E2E:** Playwright plus `@axe-core/playwright` at 360, 768 and 1280 px against the built site and gallery, merge-blocking. Evidence: test name and CI run link.
- **CI (Lighthouse) / Visual:** the blocking `Lighthouse` and `Visual regression` jobs. Evidence: run link and summary.
- **Manual:** recorded in the PR with commit, browser, viewport and screenshots where stated.

Every automated check that guards a rule has a **negative fixture** that must fail **the real check** (`AGENTS.md` rule 7). Fixtures live under `tests/fixtures/v2/` and never in `src/`, `public/` or `content/`. Every test name starts with its V2 ID (for example `V2-21 reveal is visible without animation-timeline support`). "All pages" means every built HTML page in `dist/` plus the gallery build; "the audited URLs" are those in the LHCI config.

## 1. CSP, scripts and third parties

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-01 | **CSP unchanged.** The policy string in `src/config/site.ts` and every built page's CSP `<meta>` is byte-identical to `SITE_CSP` on `main` `f12a177`: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self'`, `connect-src 'none'`, `object-src 'none'`, `require-trusted-types-for 'script'`. | Build | Compare against `tests/helpers/csp.ts` `SITE_CSP` (unchanged in the diff). PASS: equal on every page; `git diff main -- tests/helpers/csp.ts src/config/site.ts` shows no policy change. |
| V2-02 | **No inline script.** No `<script>` without `src` (other than `type="application/ld+json"` if already allowed on `main`), no `on*` attributes, no `javascript:` URLs in `dist/`. | Build | Existing F2-34 scan over all HTML. PASS: 0 hits. |
| V2-03 | **No inline style.** No `style=""` attribute and no `<style>` element in `dist/` HTML or `.astro` sources (staggers use classes or `:nth-child`, V1-57). | Build | F2-34 scan extended to V2 components. PASS: 0 hits. |
| V2-04 | **No new origins.** No absolute `http(s):` or protocol-relative URL in any `src`, `href` of `<link>`, CSS `url()`, `@import` or `@font-face` in `dist/`, other than ordinary outbound `<a href>` links already allowed. No `data:` URLs in CSS or HTML. | Build | Scan HTML and CSS. PASS: 0 hits. |
| V2-05 | **Trusted Types unchanged.** `require-trusted-types-for 'script'` present, no `trusted-types` directive, no `trustedTypes.createPolicy` anywhere in `src/` or `dist/`. | Build | grep plus F4-34 test. PASS: directive present, 0 policy hits. |
| V2-06 | **No analytics, pixels, chat widgets or embeds.** No `<iframe>`, `<embed>`, `<object>`, tracking pixel, or known analytics/ads hostnames (Meta, Bing, LinkedIn, Reddit, Google Analytics/Tag Manager, Hotjar and the existing D6 deny list). | Build | Scan HTML/CSS/JS. PASS: 0 hits. |
| V2-07 | **No CSP violations at runtime.** Loading every page in Chromium and Firefox reports no `securitypolicyviolation` events and no console CSP errors. | E2E | Listener on every page at 1280. PASS: 0 events. |
| V2-08 | **JS budget unchanged.** Editorial pages ship 0 KB JS; the tool page ships its existing single module within F4-45 (≤ 120 KB compressed); `budgets.json` script entries unchanged. No new client script, animation library (Motion, GSAP, etc.) or new runtime dependency. | Build | F4-45/F4-46 tests plus `git diff main -- budgets.json package.json`. PASS: tests green; only `@fontsource/fraunces@5.3.0` (pinned, exact) is added to dependencies and the Source Serif package removed if dropped. |

## 2. Fonts

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-09 | **Fraunces self-hosted as WOFF2.** Every `@font-face` in `dist/` CSS points to a same-origin `.woff2` file; Fraunces is imported only for latin 300 and 400 (no italics unless used); `font-display: swap`. | Build | Parse built CSS. PASS: all `src` same-origin `.woff2`; Fraunces faces are exactly latin 300/400. |
| V2-10 | **Licences committed.** Each shipped font family (Fraunces, Inter, IBM Plex Mono, and any other) has its OFL-1.1 licence text committed in the repo beside the font or in a `licenses/` path referenced from the font CSS/README, and the licence ships in `dist/` or the repo docs. | Build + Manual | Test maps each family in built `@font-face` to a committed licence file containing "SIL Open Font License". PASS: every family mapped. |
| V2-11 | **No font loader script.** No Web Font Loader, `FontFace` JS API usage, `document.fonts` manipulation or font CDN. Only the hero weight (Fraunces 300) is preloaded, and only on pages that use it. | Build | Scan JS/HTML. PASS: 0 loader hits; ≤ 1 Fraunces preload per page, same-origin, `crossorigin` set. |
| V2-12 | **Metric-matched fallback.** `font-fallbacks.css` defines `"Fraunces Fallback"` with `size-adjust` and `ascent-override` (and `descent-override`/`line-gap-override` as needed) and every Fraunces stack lists it before generic `serif`. | Unit | Token/CSS test. PASS: rule present and referenced. |
| V2-13 | **Font-swap CLS.** With fonts delayed by 2 s (route interception) the layout shift from the swap is ≤ 0.1 at 360, 768 and 1280 on home, a story, `/tools/cash-vs-profit/`, and `/cookies/` at 360; target 0 (report any non-zero value in the PR). | E2E | `PerformanceObserver('layout-shift')`, sum excluding `hadRecentInput`. PASS: ≤ 0.1 everywhere; values listed. |

## 3. Reference assets (Amadae)

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-14 | **No Amadae assets, copy, fonts or code.** The diff adds no file copied from amadae.co, no Canela or Geist font file, no Amadae text, logo, wordmark, laurel ornament, icon, illustration or photo, and the string "amadae" appears only in `docs/` (as a style reference link). | Build + Manual | Test: `rg -i "amadae\|canela"` outside `docs/` = 0; no `*canela*`/`*geist*` font files. Manual: Aegis reviews every new image/SVG and copy string as our own. PASS: 0 hits and Aegis sign-off. |
| V2-15 | **No reference captures committed.** No screenshot, video or computed-style dump of amadae.co (e.g. Forge's `ref/`, `cap.log`, `*.webm`) is in any commit of the PR, including intermediate commits. | Manual + Build | `git log -p main..HEAD --name-only` reviewed; new binaries limited to fonts, our SVGs and visual baselines of Belvoir pages. PASS: none found. |

## 4. Motion

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-16 | **Transform and opacity only.** Every `@keyframes` in built CSS animates only `transform` and `opacity`; `transition-property` never includes `all`, layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`) or `filter`. Colour/background transitions are allowed only as 150/300 ms hover transitions (brief §8). | Unit | Parse built CSS with postcss. PASS: rule holds; Lighthouse shows no "non-composited animations" audit failure. |
| V2-17 | **One easing, three durations.** Every `animation-timing-function` and `transition-timing-function` is `var(--motion-ease)` = `cubic-bezier(.4,0,.2,1)` (scroll-driven reveals may use `linear` with `animation-timeline`); every duration is `var(--motion-fast\|base\|slow)` = 150/300/500 ms; no `animation-delay`; nothing over 500 ms; no `infinite` iteration. | Unit | CSS parse. PASS: 0 other values. |
| V2-18 | **Max 8 px translate, max scale change 5%.** `fade-up` is `translateY(8px)` → 0; `pop-in` scale ≥ .95; card lift ≤ 4 px; cover scale ≤ 1.03. | Unit | CSS parse of keyframes and hover rules. PASS: within limits. |
| V2-19 | **Reduced motion removes all animation.** Under `prefers-reduced-motion: reduce` no element has a running animation and transitions are ≤ 0.01 ms; `scroll-behavior` is `auto`. | E2E | `emulateMedia({reducedMotion:'reduce'})`, then `document.getAnimations().length === 0` after scroll to bottom and hover/focus on a card, on all pages at 360 and 1280. PASS: 0 animations everywhere. |
| V2-20 | **Reveals gated.** Every `animation-timeline` declaration sits inside both `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)`. The base `.reveal` rule (and every element that receives `fade-up`) has no `opacity: 0`, `visibility: hidden` or offset transform outside those blocks. | Unit | CSS AST walk. PASS: rule holds. |
| V2-21 | **Visible and static by default: Firefox.** In Playwright Firefox (no `animation-timeline` support), every `.reveal` element on every page has computed `opacity: 1`, `transform: none` and is in the viewport when scrolled to, with no animation running. | E2E | Firefox project at 1280 and 360. PASS: all reveals visible; 0 running animations except hover transitions. If a future Firefox ships support, the check falls back to a CSS-disabled `@supports` fixture. |
| V2-22 | **Visible with JS off.** With `javaScriptEnabled: false` in Chromium, every page renders all content: every `.reveal` element ends at `opacity: 1` once in view, nothing has `.is-hidden`, and no IntersectionObserver pattern exists in `src/`. | E2E + Build | JS-off context, scroll through page, check computed styles; grep for `IntersectionObserver`/`is-hidden` = 0. PASS. |
| V2-23 | **Visible with reduced motion.** Same as V2-21 in Chromium with reduced motion on. | E2E | PASS: all reveals `opacity: 1`, `transform: none` immediately on load. |
| V2-24 | **LCP headline never animated.** The home hero H1 (and every page H1) has no `animation`, `transition` on opacity/transform, or reveal class; the LCP element reported by Lighthouse on home is the H1 (or an unanimated element) and starts at `opacity: 1`. Hero eyebrow, lead and CTAs may use `fade-up`. | Unit + CI | CSS selector check plus `getAnimations()` on the H1 = 0 at load. PASS. |
| V2-25 | **No blur, shimmer, ticker, parallax or loops.** No `filter`/`backdrop-filter` blur, gradient-text shimmer, marquee, `animation-iteration-count: infinite`, or scroll-linked parallax in built CSS. | Unit | CSS parse. PASS: 0 hits. |

## 5. Accessibility and contrast

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-26 | **Text contrast 4.5:1 (3:1 large).** Every text/background token pair in brief §3 that is used for text passes; `ink-subtle` on `surface-2` and `green` normal text on `sand` are never used. `CONTRAST.md` and `tests/unit/design-tokens.test.ts` updated for every new pair. | Unit + E2E | Token test plus axe `color-contrast` on all pages. PASS: 0 failures. |
| V2-27 | **UI contrast 3:1.** Input borders, button outlines, chips and icons conveying meaning are ≥ 3:1 against adjacent surfaces (`--color-border-strong`, not `--color-border`). | Unit | Token pair test. PASS. |
| V2-28 | **Gold rule.** `#f2c94c` (`--color-gold-bright`) and `--color-gold-soft` are used only under `.surface-ink`, `.surface-green` or `.surface-green-deep` (last-surface-class principle); never as `color`, link, underline, `outline`/focus, or sole state cue on canvas/surface/surface-2/sand. `--color-gold-on-light` never on dark surfaces. | Unit + E2E | Updated gold-rule scanner on CSS and rendered pages. PASS: 0 violations. |
| V2-29 | **Two-tone focus ring.** On light surfaces every focusable element shows a 3 px `--color-ink` outline plus a 2 px canvas inner ring (box-shadow); on `.surface-ink` it uses gold-bright. Focus is never removed (`outline: none` without replacement = fail). | E2E | Tab through every page; read computed `outline` and `box-shadow`. PASS: matches spec on every stop. |
| V2-30 | **Focus ring ≥ 3:1 against every adjacent surface.** For each focus stop, at least one ring colour has ≥ 3:1 against the element's own background and the surface behind it (canvas, surface, surface-2, sand, green, green-deep, ink, white). | E2E | Compute pairs from styles on every stop; 400% zoom screenshot evidence on canvas, green, ink. PASS: every stop ≥ 3:1. |
| V2-31 | **Nav ≥ 92% opaque.** The sticky header's background (including any `::before` stuck layer at rest and when stuck) has alpha ≥ 0.92 and no `backdrop-filter`; header height is fixed (no CLS when stuck). | E2E | Computed styles at top and after 2000 px scroll. PASS. |
| V2-32 | **axe passes.** 0 axe violations (WCAG 2.2 A/AA tags) on all pages and the gallery at 360, 768 and 1280, including the mobile `<details>` menu open. | E2E | Existing axe suite. PASS: 0. |
| V2-33 | **Keyboard order preserved.** The sequence of focus stops on each page equals `main`'s (same accessible names in the same order), except for intentionally added elements listed in the PR (e.g. announcement bar link). No positive `tabindex`. | E2E | Record tab order on `main` and the PR head. PASS: equal modulo listed additions. |
| V2-34 | **Works fully with JS off.** With JS disabled every page, the mobile menu and the tool's pre-rendered worked example (D-3) work as on `main`. | E2E | JS-off suite. PASS. |
| V2-35 | **Targets, zoom and reflow.** Buttons ≥ 44 px tall, other targets ≥ 24 px; no horizontal scroll at 320 px or at 200% zoom; body text ≥ 16 px. | E2E | Bounding boxes and scrollWidth. PASS. |

## 6. SVG line art

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-36 | **No `<script>` in SVG.** | Build | SVG scan over `src/`, `public/` and `dist/`. Fixture `tests/fixtures/v2/svg-script.svg` fails. PASS. |
| V2-37 | **No `on*` handlers in SVG.** | Build | Fixture `svg-onload.svg` (`onload=`) and `svg-onclick.svg` fail. PASS. |
| V2-38 | **No `<foreignObject>`.** | Build | Fixture `svg-foreignobject.svg` fails. PASS. |
| V2-39 | **No external `href`/`xlink:href` or `url()`.** Only `#fragment` references. Every `<img>` of an SVG has `width`/`height`, and V1-11 byte caps apply. | Build | Fixtures `svg-external-href.svg`, `svg-xlink-href.svg`, `svg-url.svg` fail. PASS. |

## 7. Budgets, Lighthouse and the visual gate

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-40 | **F4-49 pin reset from the V2 build.** The CSS size fixture is replaced by the gzip size measured from the V2 PR's own final build; the 1 KB allowance constant is unchanged. The PR body states before (main/#43) and after bytes, raw and gzip, and the reason. | Build + Manual | `git diff` of the pin test: only the fixture number changes, matching the CI-reported size ±0. PASS. |
| V2-41 | **Allowance not loosened.** Any change to the allowance, tolerance or check logic in the F4-49 test = FAIL. | Manual | Diff review. PASS: unchanged. |
| V2-42 | **Lighthouse budgets unchanged.** `budgets.json` and LHCI assertions are unchanged except none; scores are 100 in performance, accessibility and best practices on every audited URL (mobile). | CI | LHCI run. PASS. |
| V2-43 | **SEO 100 on indexable pages.** Only the existing `robots-txt` skip (F4-47) is allowed. | CI | LHCI; test pinning the one skip still green. PASS. |
| V2-44 | **LCP and CLS.** LCP < 2500 ms and ≤ main + 200 ms per URL; CLS median ≤ 0.1 at 360/768/1280, target 0, values reported in the PR. | CI + E2E | LHCI and layout-shift observer. PASS. |
| V2-45 | **Visual config uses reduced motion.** `playwright.visual.config.ts` sets `use.reducedMotion: 'reduce'` (in addition to per-test `emulateMedia`) and keeps `animations: 'disabled'`. | Unit | Config test. PASS. |
| V2-46 | **Deterministic baselines.** Two consecutive visual runs on the same head produce 0 diffs. | Visual | Re-run job. PASS. |
| V2-47 | **One baseline cycle from the final head.** Baselines are regenerated once, by Launchpad, from the final PR head SHA; no other commit touches `__screenshots__`. Snapshot names are unchanged (no churn). | Manual | `git log` of the screenshots dir. PASS. |
| V2-48 | **Sentinel image review.** Sentinel reviews every new baseline (all pages, 360/768/1280) before it is committed and records OK per image set in the PR. | Manual | PR comment. PASS. |
| V2-49 | **Tokens and breakpoints.** All colours only in `tokens.css`, ADR-0003 added, breakpoints min-width 30/48/64rem only. | Unit | Existing F2 token tests. PASS. |

## 8. Regression and reporting

| ID | Criterion | Check | Method and pass condition |
| --- | --- | --- | --- |
| V2-50 | **F2 to F5 and V1 ACs still pass.** All tests prefixed F1-, F2-, F3-, F4-, F5- and V1- are green; any test changed to accommodate V2 is listed in the PR with the reason and reviewed. | CI | Full gate. PASS: green, no skipped or deleted tests without sign-off. |
| V2-51 | **Content rules hold.** No star ratings, savings claims, testimonials or urgency copy; email addresses only `example.org`/`.invalid`. | Build | Existing guards. PASS. |
| V2-52 | **Per-AC status list in the PR body.** The PR body lists V2-01 to V2-52 each with PASS/FAIL/N/A, the test name or evidence link, and the commit tested. | Manual | PR review. PASS: complete list. |

## Negative fixtures (`tests/fixtures/v2/`)

| Fixture | Must fail |
| --- | --- |
| `html-inline-script.html` | V2-02 |
| `html-onclick.html` | V2-02 |
| `html-style-attr.html` | V2-03 |
| `html-style-block.html` | V2-03 |
| `css-remote-font.css` (`https://fonts.gstatic.com`) | V2-04 |
| `css-data-url.css` | V2-04 |
| `html-cdn-script.html` | V2-04 |
| `js-tt-policy.js` (`trustedTypes.createPolicy`) | V2-05 |
| `html-iframe.html`, `html-ga-pixel.html` | V2-06 |
| `css-fontface-ttf.css`, `css-fontface-woff.css` | V2-09 |
| `fonts-no-licence/` (woff2 without licence) | V2-10 |
| `js-fontloader.js` (`document.fonts.load`) | V2-11 |
| `src-amadae-string.astro`, `font-canela.woff2` (dummy name) | V2-14 |
| `css-keyframes-width.css`, `css-keyframes-filter.css`, `css-transition-all.css` | V2-16 |
| `css-other-easing.css`, `css-700ms.css`, `css-animation-delay.css`, `css-infinite.css` | V2-17 |
| `css-translate-12px.css` | V2-18 |
| `css-reveal-ungated.css` (timeline outside `@supports`), `css-reveal-no-media.css`, `css-reveal-base-hidden.css` (`.reveal{opacity:0}`) | V2-20 |
| `css-h1-animated.css` | V2-24 |
| `css-blur.css`, `css-backdrop-blur.css`, `css-marquee.css` | V2-25 |
| `css-gold-text-on-canvas.css`, `css-gold-focus-on-light.css`, `css-gold-on-light-in-ink.css` | V2-28 |
| `css-outline-none.css` | V2-29 |
| `css-nav-alpha-80.css` | V2-31 |
| `svg-script.svg` | V2-36 |
| `svg-onload.svg`, `svg-onclick.svg` | V2-37 |
| `svg-foreignobject.svg` | V2-38 |
| `svg-external-href.svg`, `svg-xlink-href.svg`, `svg-url.svg` | V2-39 |
| `playwright-visual-no-rm.ts` | V2-45 |

44 negative fixtures. Each must fail the real check CI runs.

## Mutants (QA, manual, on a throwaway branch)

| # | Mutation | Expected failing AC |
| --- | --- | --- |
| M-01 | Add `https://fonts.googleapis.com` to `style-src` | V2-01 |
| M-02 | Set `connect-src 'self'` | V2-01 |
| M-03 | Add `style="animation-delay:80ms"` to a hero item | V2-03, V2-17 |
| M-04 | Delete the Fraunces licence file | V2-10 |
| M-05 | Remove `size-adjust` from `"Fraunces Fallback"` | V2-12/V2-13 |
| M-06 | Move `.reveal{animation-timeline:view()}` outside `@supports` | V2-20 |
| M-07 | Add `.reveal{opacity:0}` to the base rule | V2-20, V2-21, V2-22 |
| M-08 | Delete the reduced-motion reset | V2-19, V2-23 |
| M-09 | Add `fade-up` to the home H1 | V2-24 |
| M-10 | Change `fade-up` to `translateY(12px)` and 600 ms (Forge's note values) | V2-17, V2-18 |
| M-11 | Set link colour to `--color-gold-bright` on canvas | V2-26, V2-28 |
| M-12 | Remove the inner canvas ring from the focus style | V2-30 (on green) |
| M-13 | Header background alpha 0.6 with `backdrop-filter: blur(8px)` | V2-25, V2-31 |
| M-14 | Add `<foreignObject>` to `HeroArt` SVG | V2-38 |
| M-15 | Raise the F4-49 allowance to 2 KB | V2-41 |
| M-16 | Remove `reducedMotion` from the visual config | V2-45 |
| M-17 | Add `transition: all 300ms` to cards | V2-16 |

## Open questions

- **Q-V2-1 (Atlas/Forge):** Forge's notes propose `fade-up` 12 px, hero 600 ms `cubic-bezier(.2,.7,.2,1)` with `animation-delay` staggers, and a 40 ms mobile-nav stagger. The brief (8 px, one easing, 150/300/500 ms, no `animation-delay`) wins and these ACs follow it. How is the hero stagger "by duration" done without `animation-delay` (150/300/500 per item)?
- **Q-V2-2 (Atlas/Aegis):** The brief allows the licence "committed beside it **or** shipped from the pinned package". Aegis asked for it committed. V2-10 requires a committed file; confirm.
- **Q-V2-3 (Atlas):** The brief's reduced-motion reset uses `transition-duration: 0.01ms`, not zero. V2-19 accepts ≤ 0.01 ms transitions while requiring 0 animations; confirm.
- **Q-V2-4 (Launchpad):** `AC_F5_SOURCES.md` is not on `main` `f12a177` (F5 is still being rebuilt), so V2-50 covers F5 tests only once F5 merges. Order of merge: F5 before V2?
- **Q-V2-5 (Atlas):** Firefox is not a current Playwright project. V2-21 needs a Firefox project (E2E only, not visual). Agree adding it?
- **Q-V2-6 (Launchpad):** The brief says Lighthouse 100 in all four categories; V2-43 keeps the F4-47 `robots-txt` skip as the only exception.

## Changelog

- **v0.1** (23 Oct 2026): V2-01 to V2-52, 44 negative fixtures, 17 mutants, 6 open questions. Written from `V2_BRIEF.md` at `8c90629`.
