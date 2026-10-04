# Belvoir Finance design system (F2)

This is the reference for the F2 components, tokens and rules. The acceptance criteria are in `docs/qa/AC_F2_DESIGN_SYSTEM.md`. Contrast for every colour pair is in [`CONTRAST.md`](./CONTRAST.md).

## Running the gallery

The component gallery (`/design/`) and the D12 wireframes (`/design/wireframes/<page>/`) are **dev and tests only**. They exist only when `BELVOIR_GALLERY=1` is set, which only `scripts/gallery.ts` does. `npm run build` never sets it, so `dist/` never contains them (F2-40, asserted in `tests/build/dist.test.ts`).

| Command | What it does |
| --- | --- |
| `npm run dev:gallery` | Dev server with the gallery at http://127.0.0.1:4322/belvoir-finance/design/ (no CSP in dev) |
| `npm run build:gallery` | Gallery test build to `dist-gallery/` (gitignored, never deployed), then `tests/gallery/` assertions |
| `npm run preview:gallery` | Serves `dist-gallery/` at http://127.0.0.1:4322/belvoir-finance/design/ with the production CSP |
| `npm run test:e2e` | `build:gallery`, then Playwright and axe on `dist/` (port 4321) and `dist-gallery/` (port 4322) |
| `npm run test:visual` | Gallery screenshot comparison, report only (F2-38) |
| `npm run wireframes` | Regenerates `docs/design/wireframes/*.png` from the gallery build |

The E2E checks use the gallery **test build**, never `astro dev`, because the dev server injects inline scripts and styles that would break the CSP checks. The gallery runs on port 4322 (with `--ignore-lock`) so it can run alongside `npm run dev`.

## Tokens

All tokens are defined once, in `:root` in `src/styles/tokens.css` (F2-03). No other file declares a custom property, and every `var()` must resolve to a token (F2-05). No colour literal appears anywhere else under `src/` (F2-04).

| Group | Tokens |
| --- | --- |
| Brand | `--color-navy` `#0B132B`, `--color-slate` `#1C2541`, `--color-gold` `#C5A059`, `--color-gold-on-light` `#7E6026`, `--color-alabaster` `#F8FAFC`, `--color-white` |
| Text, links, focus | `--color-text`, `--color-text-muted`, `--color-text-on-dark`, `--color-link`, `--color-focus`, `--color-focus-on-dark` (alias of gold, dark surfaces only) |
| Borders | `--color-border` (decorative only, 1.48:1), `--color-border-strong` (UI boundaries, at least 3:1) |
| States | `--color-hover-bg`, `--color-disabled-bg`, `--color-disabled-text`, `--color-button-primary-bg`, `--color-button-primary-hover-bg`, `--color-button-primary-text`, `--color-error` |
| Notice | `--color-notice-bg`, `--color-notice-text` |
| Status | `--color-status-{info,success,warning,error}-{bg,accent}` |
| Callouts | `--color-callout-{fact,estimate,example,opinion}` |
| Chart | `--color-chart-bg`, `--color-chart-series-1`, `--color-chart-series-2`, `--color-chart-axis` |
| Type | `--font-serif` (Source Serif 4), `--font-sans` (Inter), `--font-mono` (IBM Plex Mono), `--numeric` (`tabular-nums`), `--step--1` to `--step-4` |
| Space and layout | `--space-1` to `--space-6`, `--measure` (68ch), `--container-max` (72rem), `--gutter`, `--target-min` (24 px) |
| Shape | `--radius`, `--radius-pill`, `--border-width`, `--border-width-strong`, `--focus-width` (3 px), `--focus-offset` |
| Motion | `--motion-duration-fast` (120ms), `--motion-duration-base` (200ms), `--motion-ease-standard` |

New colour tokens in F2 (status, callout, chart, state and error) need Atlas's design approval on the PR.

## Breakpoints

Custom properties can't be used inside `@media`, so the breakpoints are listed here and in the `tokens.css` header comment. Media queries are mobile-first (`min-width` only), and a unit scan fails on any other width value (F2-17).

| Breakpoint | Use |
| --- | --- |
| `30rem` (480 px) | Reserved for small-screen tweaks; none used yet |
| `48rem` (768 px) | Two-up story cards and gallery grids |
| `64rem` (1024 px) | Three-up story cards, two-column gallery forms |

The grid uses `.container` (`min(100% - 2 × --gutter, --container-max)`) and CSS grid with `--space-*` gaps. Prose is capped at `--measure`.

## The gold rule

**Source:** `TASKS.md` F1 and the accessibility thresholds in `TEST_STRATEGY.md`. Atlas is writing ADR-0002 (brand colours and the gold rule); once it lands, this section will cite it.

- Brand gold `#C5A059` (`--color-gold` and any alias, such as `--color-focus-on-dark`) is used **only** in rules scoped under `.surface-navy` (7.48:1) or `.surface-slate` (6.15:1).
- Gold text or UI on light surfaces uses `--color-gold-on-light` `#7E6026` (5.85:1 on white, 5.59:1 on alabaster).
- `#7E6026` is **never** used on a dark surface (2.58:1 on slate).
- A light surface (`.surface-white`, `.surface-alabaster`) nested inside a dark band is a light surface again: `global.css` resets links, the eyebrow and focus rings to `#7E6026` there. The scanner decides a selector's surface by its **last** surface class.

Enforcement:

1. **Source scan** (F2-06, F2-07): `tests/helpers/design-scan.ts` parses every `.css` file and every `<style>` block in `.astro` files with PostCSS and postcss-selector-parser. It resolves nesting, `@media`/`@supports`, `:is()`/`:where()` lists and `:not()`, works out aliases transitively, and checks `.ts`/`.tsx` for gold strings. Fixtures are in `tests/fixtures/design/`.
2. **Compiled CSS** (F2-08): the same scanner runs on every stylesheet in `dist/` and `dist-gallery/`.
3. **Rendered** (F2-09): Playwright checks every element on the gallery, wireframes and site pages at 360, 768 and 1280 px against its nearest opaque background (outlines against the parent's).

## Surfaces

| Class | Background | Text | Links and accents | Focus ring |
| --- | --- | --- | --- | --- |
| `.surface-white` | white | `--color-text` | `--color-gold-on-light` | `--color-focus` |
| `.surface-alabaster` | alabaster | `--color-text` | `--color-gold-on-light` | `--color-focus` |
| `.surface-navy` | navy | `--color-text-on-dark` | `--color-gold` | `--color-focus-on-dark` |
| `.surface-slate` | slate | `--color-text-on-dark` | `--color-gold` | `--color-focus-on-dark` |

## Components

All components are static Astro components with no client script (F2-35), no `style` attributes or `define:vars` (F2-34) and no colour literals. Hover and focus can be shown statically in the gallery with the demo prop `demoState="hover" | "focus"`, which adds `.is-hover` or `.is-focus` mirroring `:hover` and `:focus-visible`. These are for the gallery only.

### SiteNav (`src/components/SiteNav.astro`), F2-20

- **Props:** `items: { href, label }[]`, `current` (the pathname).
- **Surface:** navy (inside the site header).
- **States:** default, hover (underline), focus (gold ring), current (`aria-current="page"` plus a gold underline bar and bold text, so it's not colour alone).
- **Notes:** a `nav` labelled "Main" with a wrapping list and no toggle or script, so it works without JavaScript at 360 px. It links only pages that exist (Home and Stories today; F3 adds the rest), and never "Work with Belvoir" (D4).

### SiteFooter (`src/components/SiteFooter.astro`), F2-21

- **Props:** `links: { href, label }[]`.
- **Surface:** slate only. Gold is used only inside it.
- **Contents:** the brand line, a link list (`nav` labelled "Footer"), the not-advice text and the preview note. There are no regulatory, certification, testimonial or price claims.

### StoryCard (`src/components/StoryCard.astro`), F2-22

- **Props:** `title`, `href`, `summary`, `format`, `level`, `date?`, `demo?`, `headingLevel` (`2`, `3` or `4`; default `2`), `surface` (`white`, `alabaster` or `slate`; default `white`).
- **Surfaces:** white, alabaster and slate. A white card can sit inside a navy band.
- **States:** title link hover and focus.
- **Notes:** the title link is the card's only interactive element. Format, level and date are text (a `dl`), and the date is in `<time datetime>`. Demo stories show a visible "Demo content" pill.

### ArticleHeader (`src/components/ArticleHeader.astro`), F2-23

- **Props:** `title`, `summary`, `author`, `reviewer?`, `format?`, `firstPublished?`, `lastReviewed?`, `period?`, `jurisdiction` (default `UK`), `titleLevel` (`1` on real pages; the gallery passes `2` to keep one `h1`).
- **Surfaces:** white and alabaster.
- **Notes:** renders a `div`, not a `header`, so it adds no second banner landmark. Dates are en-GB ("2 October 2026") in `<time datetime>`. "Reviewed by" appears only when a reviewer is passed. A jurisdiction label shows when the jurisdiction isn't `UK`. The data rules behind these fields are F3 (CF-01 to CF-05).

### SourceNote (`src/components/SourceNote.astro`), F2-24

- **Props:** `name`, `publisher`, `url`, `accessed`.
- **Surfaces:** white and alabaster.
- **Notes:** the link goes through `toSafeLink` (https only, `rel="noopener noreferrer"`) and its text is the source name. A refused URL (`http:`, `javascript:`, protocol-relative, `data:`) renders the name as plain text.

### Callout (`src/components/markdoc/Callout.astro`), F2-25

- **Props:** `type` (`fact`, `estimate`, `example` or `opinion`), `title?`.
- **Surfaces:** any light surface. The callout box itself is always white.
- **Notes:** an `<aside>` named "Type" or "Type: title", with a visible uppercase type label and a type-coloured left bar. The colour is an addition only. The Markdoc allowlist still holds exactly these four types.

### ChartWrapper (`src/components/ChartWrapper.astro`), F2-26

- **Props:** `title`, `units`, `source`, `categories: string[]`, `series` (one or two `{ name, values }`).
- **Surface:** its own white box (`.surface-white`) on any surface.
- **Notes:**
  - It's a `<figure>`. The `<figcaption>` holds the title, units and source.
  - The SVG is `aria-hidden` because the data table is the text equivalent. The table sits in a focusable (`tabindex="0"`), named scroll region.
  - Series are told apart by shape (solid versus outlined bars, with matching legend markers) and direct value labels, not colour alone.
  - Fills come from classes using chart tokens, and figures use tabular numerals. Numeric columns (header and cells) share `.data-table-num` and are right-aligned.
  - There are no inline styles, no chart library and no remote resources.

### Form controls (`src/components/forms/`), F2-27

- **Components:** `TextField` (`type` `text`, `email` or `number`), `SelectField`, `CheckboxField` and `Button` (`variant` `primary` or `secondary`; `type` is required).
- **Props:** `id`, `label`, `hint?`, `error?`, `required?`, `disabled?`, `demoState?`. Plus `value` (text), `options` (select), `checked` (checkbox).
- **Surfaces:** white and alabaster.
- **States:** default, hover, focus, error and disabled.
- **Notes:**
  - Every control has a `<label for>`. Hint and error are linked with `aria-describedby`.
  - Errors set `aria-invalid="true"`, use a `--color-error` border and show "Error:" text. "(required)" is written in the label.
  - Boundaries use `--color-border-strong` (at least 3:1). Disabled controls use a dashed border and keep 6.64:1 text.
  - The checkbox is 24 px. Number inputs are tabular.
  - Buttons are always `<button type=…>`. Gallery forms have no `action`.

### StatusNotice (`src/components/StatusNotice.astro`), F2-28

- **Props:** `variant` (`info`, `success`, `warning` or `error`), `title?`, `live?`.
- **Surfaces:** white and alabaster.
- **Notes:** a visible label ("Information", "Success", "Warning", "Error") always names the variant. Static notices have no role. Set `live` only when content changes after load: it adds `role="status"`, or `role="alert"` for errors.

### DemoBanner and the not-advice notice, F2-29

Restyle only: wording and behaviour stay in F10. The demo banner (`role="note"`, `data-testid="demo-banner"`, visible "Demo content.") now uses the warning status tokens. The not-advice notice stays an `<aside aria-label="Not financial advice" data-testid="not-advice-notice">` on every page.

## Typography

Headings, card titles and the article title use `--font-serif`. Body, navigation and forms use `--font-sans`. Figures (`.numeric`, `.metric`, chart values, figure tables and number inputs) use `--font-mono` with `font-variant-numeric: var(--numeric)`. The gallery marks figures with `data-numeric`, and E2E checks that each one computes `tabular-nums` (F2-14). Body text is 1rem with line-height 1.6. Fonts are self-hosted through `@fontsource` (the three F1 families and weights only, with `font-display: swap`; F2-15). The favicon is a self-hosted SVG at `/belvoir-finance/favicon.svg`.

## Focus

`:focus-visible` draws a `--focus-width` (3 px) outline at `--focus-offset`: `#7E6026` on light surfaces and gold on navy or slate. That's at least 3:1 everywhere (see `CONTRAST.md`). A unit scan fails on `outline: none` or `outline: 0` without a replacement in the same rule (F2-30).

## Motion

Use only the `--motion-*` tokens in `transition` and `animation` (a unit scan enforces this). Nothing auto-plays, loops or flashes. The global `prefers-reduced-motion: reduce` rule from F1 sets animation and transition to `none` and turns off smooth scrolling (F2-32).

## Wireframes (D12)

Screenshots of the 7 sitemap templates (Home, Explore, Topic, Story, Tools directory, tool page and Source library) at 360 and 1280 px are in `docs/design/wireframes/`, generated from the gallery build with `npm run wireframes`. They use only F2 components and placeholder content. Their navigation shows the target F3 nav (Home, Explore, Tools, Sources), which the real site doesn't link yet.
