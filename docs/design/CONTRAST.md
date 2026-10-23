# Contrast table (F1-24, F1-25, F2-10 to F2-12, V2-26 to V2-30)

Measured with the WCAG 2.x formula in `src/lib/contrast.ts`. Tokens live only in `src/styles/tokens.css`. The rows in **Pairs in use** are parsed by `tests/unit/design-tokens.test.ts`, which requires a `PAIRS` entry for every row (and a row for every `PAIRS` entry), checks each ratio to 2 dp against this table, and checks it against the minimum. So this table, the tests and the tokens can't drift. A component that uses a pair not listed here fails review.

Minimums (WCAG 2.2 AA): **4.5** for text; **3** for large text (at least 24 px, or 18.66 px bold), UI component boundaries, focus indicators, and chart series against the chart background.

Design rules behind the table (V2 palette, [ADR-0003](../decisions/ADR-0003-v2-palette-type.md), which supersedes the palette part of ADR-0002):

- **Gold rule** (V2-28): `--color-gold-bright` `#F2C94C` (1.53:1 on canvas) and `--color-gold-soft` `#D4C098` only on ink, green or green-deep. Gold text or marks on light surfaces use `--color-gold-on-light` `#7A5A0A`, which is never used on a dark surface.
- **Two-tone focus ring** (V2-29, V2-30): a 3 px ink outline plus a 2 px canvas inner ring (`box-shadow`). No single colour reaches 3:1 on both canvas and green (ink on green is 2.63:1), so whichever ring touches a surface carries the 3:1: ink on every light surface, canvas on green, green-deep and ink fills. On `.surface-ink`/`.surface-green-deep` the outline is gold-bright with an ink inner ring.
- `--color-border` `#E6E6E0` (1.21:1 on canvas) is for decorative hairlines only. Boundaries users must perceive use `--color-border-strong` `#6B6B64`, `--color-error` or the button colour.
- `--color-ink-subtle` is used for text on canvas only (4.28:1 on surface-2 fails), and green is never normal text on sand (4.39:1).
- Callouts sit on a surface box, so their accent pairs are measured on surface.
- The sticky header is canvas at 96% opacity (V2-31); its text is measured on canvas.
- Disabled controls are exempt from WCAG contrast, but their text is kept at 4.5:1 because it can still carry information.

## Pairs in use

| Pair | Foreground | Background | Ratio | Minimum | Used by |
| --- | --- | --- | --- | --- | --- |
| Body text on canvas | `--color-text` `#0A0A0A` | `--color-canvas` `#FBFBF9` | 19.11:1 | 4.5 | Page body, headings |
| Body text on surface | `--color-text` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 4.5 | Cards, tool panel, callouts, notice |
| Body text on surface-2 | `--color-text` `#0A0A0A` | `--color-surface-2` `#E6E6E0` | 15.80:1 | 4.5 | Table header, disabled controls |
| Body text on sand | `--color-text` `#0A0A0A` | `--color-sand` `#D4C4A8` | 11.56:1 | 4.5 | Sand band |
| Body text on white | `--color-text` `#0A0A0A` | `--color-white` `#FFFFFF` | 19.80:1 | 4.5 | Chart, diagram |
| Body text on hover background | `--color-text` `#0A0A0A` | `--color-hover-bg` `#EFEFEA` | 17.16:1 | 4.5 | Input, chip and nav hover |
| Body text on info notice | `--color-text` `#0A0A0A` | `--color-status-info-bg` `#EEF4FA` | 17.87:1 | 4.5 | Status notice (info) |
| Body text on success notice | `--color-text` `#0A0A0A` | `--color-status-success-bg` `#EEF6F0` | 17.98:1 | 4.5 | Status notice (success) |
| Body text on warning notice | `--color-text` `#0A0A0A` | `--color-status-warning-bg` `#FFF8E6` | 18.69:1 | 4.5 | Status notice (warning), demo banner |
| Body text on error notice | `--color-text` `#0A0A0A` | `--color-status-error-bg` `#FBEEEE` | 17.50:1 | 4.5 | Status notice (error) |
| Muted text on canvas | `--color-text-muted` `#4A4A45` | `--color-canvas` `#FBFBF9` | 8.60:1 | 4.5 | Hero lead, meta, form hints |
| Muted text on surface | `--color-text-muted` `#4A4A45` | `--color-surface` `#EFEFEA` | 7.72:1 | 4.5 | Card meta, tool hints |
| Muted text on surface-2 | `--color-text-muted` `#4A4A45` | `--color-surface-2` `#E6E6E0` | 7.11:1 | 4.5 | Hints on surface-2 |
| Subtle text on canvas | `--color-ink-subtle` `#6B6B64` | `--color-canvas` `#FBFBF9` | 5.18:1 | 4.5 | Captions (canvas only) |
| Headings (ink) on canvas | `--color-ink` `#0A0A0A` | `--color-canvas` `#FBFBF9` | 19.11:1 | 4.5 | Headings, wordmark, nav links |
| Headings (ink) on surface | `--color-ink` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 4.5 | Card titles, chips |
| Link (green) on canvas | `--color-link` `#2C5F34` | `--color-canvas` `#FBFBF9` | 7.26:1 | 4.5 | Links |
| Link (green) on surface | `--color-link` `#2C5F34` | `--color-surface` `#EFEFEA` | 6.52:1 | 4.5 | Links in cards |
| Link (green) on surface-2 | `--color-link` `#2C5F34` | `--color-surface-2` `#E6E6E0` | 6.00:1 | 4.5 | Links on surface-2 |
| Link (green) on white | `--color-link` `#2C5F34` | `--color-white` `#FFFFFF` | 7.52:1 | 4.5 | Links in charts |
| Link hover (green-deep) on canvas | `--color-link-hover` `#1F4426` | `--color-canvas` `#FBFBF9` | 10.59:1 | 4.5 | Link hover |
| Link hover (green-deep) on surface | `--color-link-hover` `#1F4426` | `--color-surface` `#EFEFEA` | 9.52:1 | 4.5 | Link hover in cards |
| Gold-on-light on canvas | `--color-gold-on-light` `#7A5A0A` | `--color-canvas` `#FBFBF9` | 6.15:1 | 4.5 | Eyebrows |
| Gold-on-light on surface | `--color-gold-on-light` `#7A5A0A` | `--color-surface` `#EFEFEA` | 5.53:1 | 4.5 | Eyebrows on cards |
| Gold-on-light on surface-2 | `--color-gold-on-light` `#7A5A0A` | `--color-surface-2` `#E6E6E0` | 5.09:1 | 4.5 | Eyebrows on surface-2 |
| Gold-on-light on white | `--color-gold-on-light` `#7A5A0A` | `--color-white` `#FFFFFF` | 6.37:1 | 4.5 | Callout estimate label on white |
| Text on ink | `--color-text-on-dark` `#FBFBF9` | `--color-ink` `#0A0A0A` | 19.11:1 | 4.5 | Footer, ink band, primary button, current nav pill |
| Text on green | `--color-text-on-dark` `#FBFBF9` | `--color-green` `#2C5F34` | 7.26:1 | 4.5 | Green band |
| Text on green-deep | `--color-text-on-dark` `#FBFBF9` | `--color-green-deep` `#1F4426` | 10.59:1 | 4.5 | Deep band, button hover |
| Gold-soft on ink | `--color-gold-soft` `#D4C098` | `--color-ink` `#0A0A0A` | 11.12:1 | 4.5 | Eyebrow, wordmark and link underline on ink |
| Gold-soft on green-deep | `--color-gold-soft` `#D4C098` | `--color-green-deep` `#1F4426` | 6.16:1 | 4.5 | Eyebrow on green-deep |
| Gold-bright on ink | `--color-gold-bright` `#F2C94C` | `--color-ink` `#0A0A0A` | 12.48:1 | 4.5 | Highlight on ink |
| Gold-bright on green-deep | `--color-gold-bright` `#F2C94C` | `--color-green-deep` `#1F4426` | 6.92:1 | 4.5 | Highlight on green-deep |
| Notice text on notice background | `--color-notice-text` `#0A0A0A` | `--color-notice-bg` `#EFEFEA` | 17.16:1 | 4.5 | Not-advice notice |
| Primary button text | `--color-button-primary-text` `#FBFBF9` | `--color-button-primary-bg` `#0A0A0A` | 19.11:1 | 4.5 | Primary button |
| Primary button text on hover | `--color-button-primary-text` `#FBFBF9` | `--color-button-primary-hover-bg` `#1F4426` | 10.59:1 | 4.5 | Primary button hover |
| Disabled text on disabled background | `--color-disabled-text` `#4A4A45` | `--color-disabled-bg` `#E6E6E0` | 7.11:1 | 4.5 | Disabled controls |
| Error text on canvas | `--color-error` `#A12B2B` | `--color-canvas` `#FBFBF9` | 7.00:1 | 4.5 | Form errors |
| Error text on surface | `--color-error` `#A12B2B` | `--color-surface` `#EFEFEA` | 6.29:1 | 4.5 | Tool form errors |
| Error text on white | `--color-error` `#A12B2B` | `--color-white` `#FFFFFF` | 7.25:1 | 4.5 | Form errors on white |
| Info label on info background | `--color-status-info-accent` `#245A8F` | `--color-status-info-bg` `#EEF4FA` | 6.46:1 | 4.5 | Status label |
| Success label on success background | `--color-status-success-accent` `#2E6B3F` | `--color-status-success-bg` `#EEF6F0` | 5.80:1 | 4.5 | Status label |
| Warning label on warning background | `--color-status-warning-accent` `#8A5300` | `--color-status-warning-bg` `#FFF8E6` | 5.97:1 | 4.5 | Status label, demo banner |
| Error label on error background | `--color-status-error-accent` `#A12B2B` | `--color-status-error-bg` `#FBEEEE` | 6.41:1 | 4.5 | Status label |
| Fact label on surface | `--color-callout-fact` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 4.5 | Callout label |
| Estimate label on surface | `--color-callout-estimate` `#7A5A0A` | `--color-surface` `#EFEFEA` | 5.53:1 | 4.5 | Callout label |
| Example label on surface | `--color-callout-example` `#1D5F66` | `--color-surface` `#EFEFEA` | 6.32:1 | 4.5 | Callout label |
| Opinion label on surface | `--color-callout-opinion` `#6B3E75` | `--color-surface` `#EFEFEA` | 7.08:1 | 4.5 | Callout label |
| Chart text on chart background | `--color-text` `#0A0A0A` | `--color-chart-bg` `#FFFFFF` | 19.80:1 | 4.5 | Chart labels |
| Chart series 1 on chart background | `--color-chart-series-1` `#2C5F34` | `--color-chart-bg` `#FFFFFF` | 7.52:1 | 3 | Chart bars |
| Chart series 2 on chart background | `--color-chart-series-2` `#1D5F66` | `--color-chart-bg` `#FFFFFF` | 7.29:1 | 3 | Chart outline bars |
| Chart axis on chart background | `--color-chart-axis` `#6B6B64` | `--color-chart-bg` `#FFFFFF` | 5.37:1 | 3 | Chart axis |
| Strong border on canvas | `--color-border-strong` `#6B6B64` | `--color-canvas` `#FBFBF9` | 5.18:1 | 3 | Inputs, chips |
| Strong border on surface | `--color-border-strong` `#6B6B64` | `--color-surface` `#EFEFEA` | 4.65:1 | 3 | Inputs in the tool panel |
| Strong border on white | `--color-border-strong` `#6B6B64` | `--color-white` `#FFFFFF` | 5.37:1 | 3 | Diagram outline |
| Strong border on hover background | `--color-border-strong` `#6B6B64` | `--color-hover-bg` `#EFEFEA` | 4.65:1 | 3 | Input hover |
| Error border on canvas | `--color-error` `#A12B2B` | `--color-canvas` `#FBFBF9` | 7.00:1 | 3 | Invalid input |
| Primary button boundary on canvas | `--color-button-primary-bg` `#0A0A0A` | `--color-canvas` `#FBFBF9` | 19.11:1 | 3 | Buttons |
| Primary button boundary on surface | `--color-button-primary-bg` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 3 | Buttons in the tool panel |
| Primary button boundary on sand | `--color-button-primary-bg` `#0A0A0A` | `--color-sand` `#D4C4A8` | 11.56:1 | 3 | Button on the sand band |
| Focus ring (ink) on canvas | `--color-focus` `#0A0A0A` | `--color-canvas` `#FBFBF9` | 19.11:1 | 3 | Focus outline |
| Focus ring (ink) on surface | `--color-focus` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 3 | Focus outline |
| Focus ring (ink) on surface-2 | `--color-focus` `#0A0A0A` | `--color-surface-2` `#E6E6E0` | 15.80:1 | 3 | Focus outline |
| Focus ring (ink) on sand | `--color-focus` `#0A0A0A` | `--color-sand` `#D4C4A8` | 11.56:1 | 3 | Focus outline |
| Focus ring (ink) on white | `--color-focus` `#0A0A0A` | `--color-white` `#FFFFFF` | 19.80:1 | 3 | Focus outline |
| Focus ring (ink) on notice background | `--color-focus` `#0A0A0A` | `--color-notice-bg` `#EFEFEA` | 17.16:1 | 3 | Focus outline |
| Focus inner ring (canvas) on green | `--color-focus-inner` `#FBFBF9` | `--color-green` `#2C5F34` | 7.26:1 | 3 | Inner ring on green fills |
| Focus inner ring (canvas) on green-deep | `--color-focus-inner` `#FBFBF9` | `--color-green-deep` `#1F4426` | 10.59:1 | 3 | Inner ring on green-deep (button hover) |
| Focus inner ring (canvas) on ink | `--color-focus-inner` `#FBFBF9` | `--color-ink` `#0A0A0A` | 19.11:1 | 3 | Inner ring on ink fills (primary button) |
| Focus ring on ink | `--color-focus-on-dark` `#F2C94C` | `--color-ink` `#0A0A0A` | 12.48:1 | 3 | Focus outline on ink |
| Focus ring on green-deep | `--color-focus-on-dark` `#F2C94C` | `--color-green-deep` `#1F4426` | 6.92:1 | 3 | Focus outline on green-deep |
| Focus ring on green | `--color-focus-on-dark` `#F2C94C` | `--color-green` `#2C5F34` | 4.74:1 | 3 | Focus outline on green |
| Icon (ink) on surface | `--color-ink` `#0A0A0A` | `--color-surface` `#EFEFEA` | 17.16:1 | 3 | Card icons |
| Eyebrow icon (gold-on-light) on canvas | `--color-gold-on-light` `#7A5A0A` | `--color-canvas` `#FBFBF9` | 6.15:1 | 3 | Eyebrow icon |
| Eyebrow icon (gold-soft) on ink | `--color-gold-soft` `#D4C098` | `--color-ink` `#0A0A0A` | 11.12:1 | 3 | Eyebrow icon on ink |
| Art line (green) on surface | `--color-green` `#2C5F34` | `--color-surface` `#EFEFEA` | 6.52:1 | 3 | Line art |
| Diagram outline on white | `--color-border-strong` `#6B6B64` | `--color-white` `#FFFFFF` | 5.37:1 | 3 | Diagram |
| Diagram arrow (teal) on white | `--color-chart-series-2` `#1D5F66` | `--color-white` `#FFFFFF` | 7.29:1 | 3 | Diagram |
| Diagram dots (green) on white | `--color-green` `#2C5F34` | `--color-white` `#FFFFFF` | 7.52:1 | 3 | Diagram |
| Diagram coin (gold-on-light) on white | `--color-gold-on-light` `#7A5A0A` | `--color-white` `#FFFFFF` | 6.37:1 | 3 | Diagram |
| Diagram coin mark (white) on gold-on-light | `--color-white` `#FFFFFF` | `--color-gold-on-light` `#7A5A0A` | 6.37:1 | 3 | Diagram |

## Decorative art pairs (V1-16, exempt)

Hero, pillar and cover art is decorative (`aria-hidden`, no text, nothing meaningful depends on it), so WCAG 1.4.11 doesn't apply, but it uses only tokens. V2 line art sits on `.surface-raised` (`#EFEFEA`) panels: green (`#2C5F34`, 6.52:1) and ink lines, canvas and sand fills, gold-on-light accents (5.53:1). Gold-bright is never used on these light panels. Text never sits on art.

## Pairs that must fail (never used)

| Pair | Ratio | Why it is never used |
| --- | --- | --- |
| Gold-bright `#F2C94C` on canvas `#FBFBF9` | 1.53:1 | Never text, links, focus or a sole state cue on light (V2-28) |
| Ink `#0A0A0A` on green `#2C5F34` | 2.63:1 | Why the focus ring is two-tone (V2-29) |
| Ink-subtle `#6B6B64` on surface-2 `#E6E6E0` | 4.28:1 | Not for text; fine as a 3:1 UI border |
| Green `#2C5F34` on sand `#D4C4A8` | 4.39:1 | Large text and UI only |
| Gold `#C5A059` on white `#FFFFFF` (F2) | 2.46:1 | F2 fixture, kept for the F2-07 test |

Enforcement: a PostCSS source scan (`tests/helpers/design-scan.ts`, F2-06/F2-07, V2-28), a compiled-CSS check on `dist/` and the gallery build (F2-08), and a rendered check (F2-09). axe also checks rendered contrast on every page.
