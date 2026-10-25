# V2 design brief: visual and UX refresh with motion

**Owner:** Atlas. **Requested by:** Francis, 23 Oct 2026. **Build:** Forge on `feat/v2-design`. **ACs:** Sentinel drafts `docs/qa/AC_V2_DESIGN.md` from this brief. **Security:** Aegis.

Francis asked for a look and feel similar to [amadae.co](https://amadae.co/). This brief takes Amadae's **style only**: palette mood, type contrast, spacing, shapes and motion. We never copy Amadae's text, logo, wordmark, images, illustrations, icons, code or brand name. Belvoir stays an independent educational site, and every word, image and illustration on it stays our own.

No Amadae screenshots or other assets are committed: the repo is public and those images are Amadae's copyrighted work. The reference is the live site at <https://amadae.co/>, and the patterns are described in words below. Measurements come from Atlas's and Forge's headless-Chromium captures of 23 Oct 2026, kept off the repo.

## 1. What we observed on the reference

| Aspect | Observed (computed CSS) |
| --- | --- |
| Base | Warm off-white page `#fbfbf9`, near-black text `#0a0a0a` / `#111` / `#222`, muted grey about `#555`; secondary surfaces `#efefea`, `#e6e6e0` |
| Accents | Forest green `#2c5f34` (fills, announcement bar, line-art illustration); gold `#f2c94c` (small laurel ornaments beside eyebrows), plus `#b8860b`, `#d4c098`; sand neutrals `#d4c4a8`, `#ede4c8`; pale blues `#e8f1fa`, `#d4e5f7` |
| Headings | Light display serif (Canela, commercial). Hero H1 128 px, weight 300, line-height 1.1, tracking −0.025em, left-aligned. Section H2 60 px weight 400 |
| Body | Geist Sans: 16/24 body, 14 px secondary, 12 px weight 500 uppercase tracked eyebrows, weight 700 at 20/24/30/48 for card titles |
| Shape | Mostly square. Pills (9999 px) for buttons and the nav; cards and images 16 px; small 4 px; large panels 24 / 40 px |
| Shadow | Mostly none; cards have no border or shadow |
| Section rhythm | Very generous whitespace, sections roughly 120–160 px apart; full-bleed feature bands with 80–96 px padding |
| Hero | A full-bleed strip of lifestyle photos, then a laurel eyebrow and a huge serif headline with two pill CTAs (filled black and outlined) |
| Cards | 3-up, image on top with 16 px radius, bold sans title, 16 px body |
| Header | Floating pill bar inset about 44 px, translucent light grey with backdrop blur, black pill CTA; background solidifies after scroll |
| Motion | One easing, `cubic-bezier(.4,0,.2,1)`, at 150 ms (opacity, colour), 300 ms (colour, background, border, nav), 350–500 ms (card and image hover). Keyframes: `fade-up` (opacity 0 → 1, translateY 8 px → 0), `fade-in`, `pop-in` (scale .95 → 1), a staggered mobile-nav item fade, an 80 s logo marquee, a shimmer gradient on text, a blur-in (`filter`), and looping pulses |
| Reveals | JavaScript-driven: sections fade up as they enter the viewport |
| Third parties | A chat widget that opens on its own, and several ad and analytics pixels |

The things that make it feel premium: a very large, light serif headline on a calm warm off-white, generous whitespace, black pill CTAs, and short, small-distance fade-ups. We take those.

**Drop list (we do not emulate):** JavaScript reveals; `filter: blur` and shimmer effects; the logo ticker/marquee (WCAG 2.2.2, and we have no partner logos); the chat widget and tracking pixels (CSP `connect-src 'none'`, no-analytics rule); a translucent or blurred pill nav; looping animations; animating the hero headline (it is the LCP element); lifestyle photography. Belvoir uses its own single-colour SVG line art instead of photos.

## 2. Design principles

1. **Calm, warm, editorial.** Warm off-white canvas, near-black ink, one accent (green) and one highlight (gold). No gradients behind text.
2. **Contrast of scale.** One huge light serif headline per page, then quiet sans body text.
3. **Space is the decoration.** Bigger section padding, fewer borders, fewer boxes.
4. **Motion confirms, never performs.** Short fades and lifts only. Nothing loops, nothing blocks reading, and nothing moves under `prefers-reduced-motion: reduce`.
5. **Trust over sales.** Belvoir teaches; CTAs say "Read", "Try the tool", "Explore". No fake ratings, savings claims or urgency.
6. **Same quality bar.** WCAG 2.2 AA, Lighthouse 100, CLS 0 target, the current CSP, no new origins, no new JS.

## 3. Colour tokens

V2 replaces the navy/slate/gold brand (ADR-0002) with the tokens below. This needs **ADR-0003** (supersedes the palette and fonts parts of ADR-0002) and updates to `CONTRAST.md`, `tests/unit/design-tokens.test.ts` and the gold-rule scanner. All are still declared only in `src/styles/tokens.css`.

| Token | Hex | Role |
| --- | --- | --- |
| `--color-canvas` | `#fbfbf9` | Page background (replaces alabaster) |
| `--color-surface` | `#efefea` | Cards, tool panels, alternate sections |
| `--color-surface-2` | `#e6e6e0` | Inputs, table header, pressed state |
| `--color-sand` | `#d4c4a8` | Warm feature band (light surface) |
| `--color-ink` | `#0a0a0a` | Body text, headings, primary button, dark band |
| `--color-ink-muted` | `#4a4a45` | Secondary text |
| `--color-ink-subtle` | `#6b6b64` | Captions/meta on canvas and surface only (see table) |
| `--color-green` | `#2c5f34` | Accent: links, focus on light, announcement bar, green band |
| `--color-green-deep` | `#1f4426` | Hover on green, deep band |
| `--color-gold-bright` | `#f2c94c` | Highlight on dark surfaces only (ink, green-deep) |
| `--color-gold-soft` | `#d4c098` | Eyebrows and rules on dark surfaces only |
| `--color-gold-on-light` | `#7a5a0a` | Gold text/icons on light surfaces (replaces `#7e6026`) |
| `--color-border` | `#e6e6e0` | Decorative hairlines only |
| `--color-border-strong` | `#6b6b64` | Input and UI boundaries (≥ 3:1) |

`#b8860b` (reference gold) is **3.14:1** on canvas, so it may only be used for decorative, non-text marks that are ≥ 3:1 graphics or purely ornamental. Text gold on light is `#7a5a0a`.

Focus rings: see §7 (two-tone, ≥ 3:1 on both off-white and green). Status, callout and chart accents keep their current hues (they pass on the new canvas, see below); Forge re-runs the full contrast test with every new pair.

### Contrast (WCAG 2.x relative luminance, computed)

| Foreground | Background | Ratio | Use | AA |
| --- | --- | --- | --- | --- |
| ink `#0a0a0a` | canvas `#fbfbf9` | 19.11 | Body, headings | Pass |
| ink | surface `#efefea` | 17.16 | Card text | Pass |
| ink | surface-2 `#e6e6e0` | 15.80 | Inputs, table header | Pass |
| ink | sand `#d4c4a8` | 11.56 | Sand band text | Pass |
| ink | white `#ffffff` | 19.80 | Chart area | Pass |
| ink-muted `#4a4a45` | canvas | 8.60 | Secondary text | Pass |
| ink-muted | surface | 7.72 | | Pass |
| ink-muted | surface-2 | 7.11 | | Pass |
| ink-subtle `#6b6b64` | canvas | 5.18 | Meta, captions | Pass |
| ink-subtle | surface-2 | 4.28 | **Not allowed** for text (fails 4.5); OK as 3:1 UI border | Fail (text) |
| green `#2c5f34` | canvas | 7.26 | Links, focus ring | Pass |
| green | surface | 6.52 | | Pass |
| green | surface-2 | 6.00 | | Pass |
| green | white | 7.52 | Chart series | Pass |
| green | sand | 4.39 | **Not allowed** for normal text; large text/UI only (≥ 3:1) | Large only |
| canvas `#fbfbf9` | green | 7.26 | Text on green band / announcement bar | Pass |
| canvas | green-deep `#1f4426` | 10.59 | Button hover, deep band | Pass |
| canvas | ink | 19.11 | Primary button, dark band, footer | Pass |
| canvas | `#222222` | 15.36 | (if a softer dark band is used) | Pass |
| gold-bright `#f2c94c` | ink | 12.48 | Highlight on dark | Pass |
| gold-bright | green-deep | 6.92 | | Pass |
| gold-bright | green | 4.74 | Pass, but prefer green-deep | Pass |
| gold-soft `#d4c098` | ink | 11.12 | Eyebrow on dark | Pass |
| gold-soft | green-deep | 6.16 | | Pass |
| gold-on-light `#7a5a0a` | canvas | 6.15 | Gold text on light | Pass |
| gold-on-light | surface | 5.53 | | Pass |
| gold-on-light | surface-2 | 5.09 | | Pass |
| gold-bright `#f2c94c` | canvas | 1.53 | Never text, links, focus or sole state signal on light | Fail |
| ink | green | 2.63 | Why the focus ring is two-tone | Fail |
| `#b8860b` | canvas | 3.14 | Decorative only, never text | Text fail |
| error `#a12b2b` | canvas | 7.00 | Form errors | Pass |
| callout example `#1d5f66` | canvas | 7.04 | | Pass |
| callout opinion `#6b3e75` | canvas | 7.88 | | Pass |

**New gold rule:** `--color-gold-bright` and `--color-gold-soft` only under `.surface-ink`, `.surface-green` or `.surface-green-deep`; `--color-gold-on-light` never on those. The scanner keeps working on the "last surface class" principle with the renamed classes.

## 4. Typography

| Role | Font | Licence | Files (latin woff2, @fontsource 5.3.0) |
| --- | --- | --- | --- |
| Display + headings | **Fraunces** (variable-axis serif with soft, high-contrast "wonky" forms; at weight 300 and opsz high it is the closest free match to Canela's light display cut) | OFL-1.1 | 300: 17.9 KB, 400: 18.0 KB |
| Body, UI, H3–H6 | **Inter** (existing, already self-hosted; close to Geist Sans) | OFL-1.1 | unchanged |
| Numbers in tools | **IBM Plex Mono** (existing) or Inter `tabular-nums` | OFL-1.1 | unchanged |

Alternatives considered: Newsreader (300 22.9 KB, 400 22.5 KB; more bookish) and Instrument Serif (400 only, 21.0 KB; condensed, no light weight). Fraunces wins on look and size. Source Serif 4 is dropped (about −40 KB), so with Fraunces (+36 KB) total font bytes go down slightly; the site ships 5 woff2 files, 112 KB, today. The variable Fraunces (36.6 KB, or 67.3 KB with the opsz axis) is not used.

Rules: self-hosted WOFF2 only, with each font's OFL licence file committed beside it (or shipped from the pinned package with the licence included in the build), and no font-loader script. Install `@fontsource/fraunces@5.3.0` (pinned), import only latin 300 and 400 (no italics unless used), `font-display: swap`, a metric-matched `"Fraunces Fallback"` in `font-fallbacks.css` (size-adjust/ascent-override) so the swap causes no reflow, and preload only the hero weight (300). Set `font-variation-settings`/`font-optical-sizing: auto` only if the static files support it; otherwise use static weights.

### Type scale (fluid, `clamp()`)

| Token | Size | Line height | Tracking | Font/weight | Use |
| --- | --- | --- | --- | --- | --- |
| `--step-display` | `clamp(2.75rem, 1rem + 6vw, 6rem)` (44 → 96 px) | 1.02 | −0.025em | Fraunces 300 | Home hero H1 |
| `--step-5` | `clamp(2.25rem, 1.6rem + 2.9vw, 4rem)` (36 → 64) | 1.1 | −0.02em | Fraunces 300 | Page H1 |
| `--step-4` | `clamp(1.875rem, 1.5rem + 1.6vw, 2.75rem)` (30 → 44) | 1.15 | −0.015em | Fraunces 400 | Section H2 |
| `--step-3` | `clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)` | 1.25 | −0.01em | Fraunces 400 | Card/feature titles |
| `--step-2` | 1.5rem | 1.33 | −0.01em | Inter 600 | H3 (sans, like the reference) |
| `--step-1` | 1.25rem | 1.5 | −0.01em | Inter 400 | Lead paragraph |
| `--step-0` | 1rem (1.0625rem for prose) | 1.6 | −0.01em | Inter 400 | Body |
| `--step--1` | 0.875rem | 1.45 | 0 | Inter 500 | Meta, captions |
| `--step-eyebrow` | 0.75rem | 1.3 | +0.12em uppercase | Inter 500 | Eyebrows |

Body text stays at 16 px minimum (the reference's 14 px paragraphs are not adopted). Prose `--measure` stays 42.5rem.

## 5. Spacing and grid

- Keep `--space-1`…`--space-6`; add `--space-7: 6rem` (96 px) and `--space-8: 8rem` (128 px).
- Section padding: `--section-y: clamp(3rem, 2rem + 4vw, 6rem)`; full-bleed bands `clamp(4rem, 3rem + 4vw, 6rem)`.
- `--container-max` 72rem → **80rem**, gutter `clamp(1rem, 0.5rem + 2vw, 2rem)`.
- 12-column CSS grid inside `.container` at ≥ 64rem; cards 1-up < 48rem, 2-up ≥ 48rem, 3-up ≥ 64rem. Breakpoints unchanged (30/48/64rem, min-width only).

## 6. Radii and shadows

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 4px | Inputs, tags, table |
| `--radius` | 16px | Cards, images, callouts |
| `--radius-lg` | 24px | Tool panels, hero art frame, inset bands |
| `--radius-pill` | 999px | Buttons, header pill, chips |
| `--shadow-none` | none | Default |
| `--shadow-raise` | `0 1px 2px rgb(10 10 10 / 0.04), 0 8px 24px rgb(10 10 10 / 0.06)` | Card hover/focus only, on a `::after` layer whose opacity transitions |

Shadow colours are written as tokens (no colour literals outside `tokens.css`).

## 7. Components (mapped to existing code)

| Component | Today | V2 |
| --- | --- | --- |
| **Announcement bar** (new, optional) | — | Thin `surface-green` strip above the header with one short Belvoir line (e.g. "New: the cash-versus-profit tool"), canvas text 7.26:1. Static, no dismiss JS. |
| **Header/nav** `SiteNav.astro` | Navy bar | Canvas header, Fraunces wordmark "Belvoir" (our own text), Inter nav links, ink pill CTA ("Try the tool"). `position: sticky` with a fixed height (no CLS). Background is canvas at **≥ 92% opacity** so text contrast holds over anything beneath; **no blurred or floating translucent pill**. A hairline/shadow appears once stuck via a scroll-driven opacity change on a `::before` layer under `@supports`; no JS. Mobile keeps the existing `<details>` no-JS menu, restyled. |
| **Hero** `.page-hero.home-hero`, `HeroArt.astro` | Navy band, serif H1, art | Canvas hero, centred or left-aligned `--step-display` Fraunces 300 headline, small gold-on-light eyebrow with our own laurel-free rule ornament, lead in ink-muted, two pill CTAs (filled ink + outlined ink). HeroArt sits below in a `--radius-lg` frame on `surface`. The H1 is the LCP element and is **never animated**. |
| **Feature cards** `StoryCard.astro`, `.story-list` | White cards with border | `surface` cards, `--radius`, no border, 24–32 px padding, StoryCover at top with 12 px radius, Fraunces `--step-3` title, Inter summary. Hover/focus-within: lift 2–4 px + `--shadow-raise`, 200 ms. Whole card clickable via existing link pattern. |
| **Explainer bands** `.feature-band.surface-navy` | Navy band | Three variants: `surface-ink` (canvas text, gold-soft eyebrow), `surface-green-deep`, `surface-sand` (ink text). Full-bleed, `--section-y` padding, large Fraunces H2, optional 2-column text + PillarArt. |
| **Tool panels** cash-vs-profit form/results | White/alabaster panel | `surface` panel, `--radius`, inputs on `canvas` with `--color-border-strong` 1 px and 4 px radius, 44 px tall; results in a `surface-2` table with tabular figures. F4-23 narrow-table rules stay. Primary "Update" button = ink pill. |
| **Callouts** (Fact/Estimate/Example/Opinion) | Left border accent | `surface` box, `--radius`, 4 px left accent in the existing callout hue, text label kept (colour never the only cue). |
| **Not-advice notice / status** | Warm notice | Keep semantics; restyle to `--radius` and the new canvas. Re-check pairs. |
| **Buttons** | 4 px radius, navy | Pill. Primary: ink bg, canvas text (19.11:1), hover green-deep (10.59:1). Secondary: transparent, 1.5 px ink border, hover `surface`. Min height 44 px, padding 0.75rem 1.5rem, Inter 600. |
| **Links** | Gold-on-light underline | Green `#2c5f34`, underline 1 px offset 0.2em; hover thickens to 2 px and goes green-deep. On dark: canvas with gold-soft underline. |
| **Focus** | 3 px gold-on-light | Two-tone ring so it is ≥ 3:1 against both the off-white and the green: a 3 px ink `outline` (19.11:1 on canvas) with a 2 px canvas inner ring via `box-shadow` (7.26:1 on green, 19.11:1 on ink). One colour can't do both: ink on green is only 2.63:1. On `surface-ink`, use gold-bright (12.48:1). Never removed; never gold on light. |
| **Footer** `SiteFooter.astro` | Navy | `surface-ink`, 64 px top padding, large Fraunces "Belvoir" line, link columns in plain canvas text (19.11:1); no reduced-opacity text. |
| **Article** `ArticleHeader.astro`, story pages | Serif title | `--step-5` Fraunces 300 title, eyebrow, meta in ink-subtle on canvas (5.18:1), cover in `--radius`. Prose unchanged in measure. |

## 8. Motion

One easing everywhere: `--motion-ease: cubic-bezier(.4, 0, .2, 1)`. Three durations: `--motion-fast: 150ms`, `--motion-base: 300ms`, `--motion-slow: 500ms`. Only `transform` and `opacity` are animated (hover colour changes are transitions, not keyframes), so there is no layout shift and no Lighthouse non-composited-animation warning.

| Motion | Spec |
| --- | --- |
| Links, buttons, nav hover/focus | Colour/background 150 ms; button arrow `translateX(3px)` 150 ms |
| Card hover / focus-within | `translateY(-2px)` + shadow layer opacity, 300 ms; cover `scale(1.03)` 500 ms |
| Header stuck state | `::before` overlay opacity, 300 ms, scroll-driven |
| Hero load (eyebrow, lead, CTAs only) | `fade-up` 500 ms, staggered by duration (V1-57: never `animation-delay`, never inline `style=`). **The H1 is never animated** (LCP) |
| Scroll reveal (sections, cards, bands) | `fade-up` |
| Dialog-like or small UI pops (rare) | `pop-in`: opacity 0 → 1, `scale(.98)` → 1, 150 ms |
| Mobile menu items | `fade-in`, 150 ms |

Keyframes: `fade-up` = opacity 0 → 1 with `translateY(8px)` → 0 (**8 px, not more**); `fade-in` = opacity only; `pop-in` = small scale.

**Scroll reveal is CSS scroll-driven, with content visible by default:**

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .reveal {
      animation: fade-up linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 40%;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- The base style of `.reveal` is fully visible; only the timeline applies the start state. Without `@supports (animation-timeline: view())` (for example Firefox today), with JS off, and with reduced motion, content renders **fully visible and static**. Sentinel checks all three.
- No JavaScript reveal and no IntersectionObserver / `.is-hidden` pattern: it hides content with JS off and risks LCP and CLS. Editorial pages stay 0 KB JS (V1-45).
- Nothing loops, no parallax, no `filter`/blur, no animation over 500 ms, max translate 8 px.
- The visual Playwright config uses `reducedMotion: 'reduce'` (plus `animations: 'disabled'` on screenshots), and the V2 CSS drops all animations under reduced motion, so baselines are deterministic.

## 9. Constraints

- **CSP stays exactly as in `src/config/site.ts`**: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self'`, `connect-src 'none'`, `object-src 'none'`, `require-trusted-types-for 'script'`. **No new origins.** No CDN fonts, no data: URLs.
- **No inline script, no `style` attributes, no `<style>` blocks.** Staggers use classes or `:nth-child`, never `style=`.
- **Fonts:** self-hosted WOFF2 only, pinned `@fontsource` packages, each font's licence file committed beside it, **no font-loader script**.
- **JS budget:** no new JavaScript. Editorial pages stay 0 KB; the tool page keeps its existing script and budget.
- **CSS budget:** expected about **+1–1.2 KB gzip** (about +3–4 KB raw on today's 22,895 B bundle) for tokens, motion and nav. The V2 PR resets the F4-49 CSS pin to a fixture measured from its **own build**, with the measured numbers and the reason in the PR body. The 1 KB allowance is never loosened; any budget change is agreed in the PR, never quietly loosened.
- **SVG line art** must pass the existing SVG scan: no `<script>`, no `on*` handlers, no `<foreignObject>`, no external `href` or `url()`. Each rule gets its own negative fixture. Every image has `width`/`height`; existing per-file byte caps (V1-11) apply.
- **Gold `#f2c94c`** is about 1.5:1 on the off-white (computed 1.53), so it is never used for text, links or focus rings on light surfaces, and never as the only signal of a state. On light it is decorative only.
- **Focus** ring ≥ 3:1 against both the off-white and the green (§7: two-tone ink + canvas ring).
- **Nav** ≥ 92% opaque; no blurred pill.
- **Lighthouse:** 100 in all four categories, mobile, on every audited URL; LCP < 2500 ms and no worse than +200 ms vs main; CLS ≤ 0.1 budget at 360/768/1280, target 0 (metric-matched font fallbacks; transform/opacity only).
- **Accessibility:** WCAG 2.2 AA; every text pair in §3 ≥ 4.5:1 (≥ 3:1 for large text and UI); 24 px target minimum, 44 px buttons; 200% zoom and 320 px reflow; axe 0 violations; keyboard order unchanged.
- **Tokens:** only in `tokens.css`; no colour literals elsewhere; breakpoints min-width 30/48/64rem only.
- **Content:** no Amadae copy, logos, images, icons, layouts' assets or name on the site, and no Amadae captures in the repo. No star ratings, savings claims or testimonials. Repo guard: no email addresses outside `example.org` / `.invalid`.
- **Visual tests** run with reduced motion on.
- **Release:** one V2 PR, stacked on #43 (`fix/f4-lows`), with one baseline cycle (all page baselines change). Nothing is deployed: "merged" means on `main` and in the local preview.

## 10. Page-by-page change list

| Page | Changes |
| --- | --- |
| All (`BaseLayout.astro`) | New tokens, Fraunces + fallback, canvas background, new header/footer, optional announcement bar, focus styles |
| Home `index.astro` | Display hero (Fraunces 300, two pill CTAs, HeroArt in rounded frame); story list as surface cards with reveal; `.feature-band` → `surface-ink` explainer band; a `surface-sand` band linking to the tool; page links as pill chips |
| Stories index / Explore / Topics | Page H1 `--step-5`; card grid 1/2/3-up with reveal; topic filter links as chips |
| Story `[slug]` | New article header, rounded cover, callouts restyled, charts on white in `--radius` frame, source notes restyled |
| Tools index | Tool cards with ToolIcon, ink pill "Open tool" |
| Cash-vs-profit tool | Surface panel form, pill Update button, results table on surface-2, F4-23 narrow rules kept; no new JS |
| People / Person | Rounded portrait frames (our own art only), name in Fraunces |
| Sources, Editorial standards, About, Contact, Newsletter, Privacy, Terms, Cookies | Typography and spacing only; forms get the new input style |
| 404 | Display-size "Page not found" in Fraunces, ink pill back to home |
| Gallery `/design/` (dev only) | Add every new component and both reduced-motion states |

## 11. Delivery

One PR on `feat/v2-design`, stacked on #43, with the phases as commits:

1. ADR-0003 (palette and fonts), `tokens.css`, Fraunces + licence + fallback, `CONTRAST.md` and the token test.
2. Layout and components: header/nav, hero, cards, article, tool panels, callouts, footer, buttons, links.
3. Motion and the reduced-motion reset.
4. Full gate (format, lint, typecheck, unit, build, gallery, E2E, Lighthouse), the F4-49 pin reset with measured numbers, then the single rebaseline cycle after Sentinel OKs the images.
