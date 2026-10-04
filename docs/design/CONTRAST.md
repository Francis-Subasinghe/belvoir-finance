# Contrast table (F1-24, F1-25, F2-10 to F2-12)

Measured with the WCAG 2.x formula in `src/lib/contrast.ts`. Tokens live only in `src/styles/tokens.css`. The rows in **Pairs in use** are parsed by `tests/unit/design-tokens.test.ts`, which requires a `PAIRS` entry for every row (and a row for every `PAIRS` entry), checks each ratio to 2 dp against this table, and checks it against the minimum. So this table, the tests and the tokens can't drift. A component that uses a pair not listed here fails review.

Minimums (WCAG 2.2 AA): **4.5** for text; **3** for large text (at least 24 px, or 18.66 px bold), UI component boundaries, focus indicators, and chart series against the chart background.

Design rules behind the table:

- **Gold rule** (`TASKS.md` F1, `TEST_STRATEGY.md` accessibility thresholds; ADR-0002 to follow): gold `#C5A059` only on navy or slate. Gold text or UI on light surfaces uses `#7E6026`, which is never used on a dark surface.
- `--color-border` `#CBD5E1` (1.48:1 on white) is for decorative dividers only (cards, table rows, gallery frames). Boundaries users must perceive use `--color-border-strong`, `--color-error` or the button colour.
- Callouts always sit on a white box, whatever the surrounding surface, so their accent pairs are measured on white only.
- The checkbox is the native control (24 × 24 px, `accent-color` navy); its unchecked border comes from the browser's own styles, and axe checks it in the rendered pages.
- Disabled controls are exempt from WCAG contrast, but their text is kept at 4.5:1 because it can still carry information.

## Pairs in use

| Pair | Foreground | Background | Ratio | Minimum | Used by |
| --- | --- | --- | --- | --- | --- |
| Body text on white | `--color-text` `#1C2541` | `--color-white` `#FFFFFF` | 15.10:1 | 4.5 | Body, card, callout, form text |
| Body text on alabaster | `--color-text` `#1C2541` | `--color-alabaster` `#F8FAFC` | 14.44:1 | 4.5 | Page body |
| Body text on hover background | `--color-text` `#1C2541` | `--color-hover-bg` `#F1F5F9` | 13.79:1 | 4.5 | Input hover |
| Body text on info notice | `--color-text` `#1C2541` | `--color-status-info-bg` `#EEF4FA` | 13.63:1 | 4.5 | Status notice (info) |
| Body text on success notice | `--color-text` `#1C2541` | `--color-status-success-bg` `#EEF6F0` | 13.72:1 | 4.5 | Status notice (success) |
| Body text on warning notice | `--color-text` `#1C2541` | `--color-status-warning-bg` `#FFF8E6` | 14.26:1 | 4.5 | Status notice (warning), demo banner |
| Body text on error notice | `--color-text` `#1C2541` | `--color-status-error-bg` `#FBEEEE` | 13.35:1 | 4.5 | Status notice (error) |
| Muted text on white | `--color-text-muted` `#4A5568` | `--color-white` `#FFFFFF` | 7.53:1 | 4.5 | Form hints |
| Muted text on alabaster | `--color-text-muted` `#4A5568` | `--color-alabaster` `#F8FAFC` | 7.19:1 | 4.5 | Form hints |
| Headings (navy) on white | `--color-navy` `#0B132B` | `--color-white` `#FFFFFF` | 18.38:1 | 4.5 | Headings, chart title, secondary button text |
| Headings (navy) on alabaster | `--color-navy` `#0B132B` | `--color-alabaster` `#F8FAFC` | 17.57:1 | 4.5 | Headings |
| Navy on hover background | `--color-navy` `#0B132B` | `--color-hover-bg` `#F1F5F9` | 16.78:1 | 4.5 | Secondary button hover |
| Gold-on-light on white | `--color-gold-on-light` `#7E6026` | `--color-white` `#FFFFFF` | 5.85:1 | 4.5 | Links, eyebrow, focus ring |
| Gold-on-light on alabaster | `--color-gold-on-light` `#7E6026` | `--color-alabaster` `#F8FAFC` | 5.59:1 | 4.5 | Links, eyebrow, focus ring |
| Gold-on-light on notice background | `--color-gold-on-light` `#7E6026` | `--color-notice-bg` `#FFF8E6` | 5.52:1 | 4.5 | Links or focus inside the not-advice notice |
| Gold-on-light on hover background | `--color-gold-on-light` `#7E6026` | `--color-hover-bg` `#F1F5F9` | 5.34:1 | 4.5 | Focus ring on a hovered input |
| Gold-on-light on info notice | `--color-gold-on-light` `#7E6026` | `--color-status-info-bg` `#EEF4FA` | 5.28:1 | 4.5 | Links in status notices |
| Gold-on-light on success notice | `--color-gold-on-light` `#7E6026` | `--color-status-success-bg` `#EEF6F0` | 5.32:1 | 4.5 | Links in status notices |
| Gold-on-light on error notice | `--color-gold-on-light` `#7E6026` | `--color-status-error-bg` `#FBEEEE` | 5.17:1 | 4.5 | Links in status notices |
| Gold on navy | `--color-gold` `#C5A059` | `--color-navy` `#0B132B` | 7.48:1 | 4.5 | Header links, current-page bar, eyebrow on navy |
| Gold on slate | `--color-gold` `#C5A059` | `--color-slate` `#1C2541` | 6.15:1 | 4.5 | Footer links and accent |
| Text on navy | `--color-text-on-dark` `#F8FAFC` | `--color-navy` `#0B132B` | 17.57:1 | 4.5 | Header, navy bands |
| Text on slate | `--color-text-on-dark` `#F8FAFC` | `--color-slate` `#1C2541` | 14.44:1 | 4.5 | Footer, slate story card |
| Notice text on notice background | `--color-notice-text` `#5C4511` | `--color-notice-bg` `#FFF8E6` | 8.56:1 | 4.5 | Not-advice notice |
| Primary button text | `--color-button-primary-text` `#F8FAFC` | `--color-button-primary-bg` `#0B132B` | 17.57:1 | 4.5 | Primary button |
| Primary button text on hover | `--color-button-primary-text` `#F8FAFC` | `--color-button-primary-hover-bg` `#1C2541` | 14.44:1 | 4.5 | Primary button hover |
| Disabled text on disabled background | `--color-disabled-text` `#4A5568` | `--color-disabled-bg` `#EEF1F5` | 6.64:1 | 4.5 | Disabled inputs and buttons (still readable) |
| Error text on white | `--color-error` `#A12B2B` | `--color-white` `#FFFFFF` | 7.25:1 | 4.5 | Form error message |
| Error text on alabaster | `--color-error` `#A12B2B` | `--color-alabaster` `#F8FAFC` | 6.93:1 | 4.5 | Form error message |
| Info label on info background | `--color-status-info-accent` `#245A8F` | `--color-status-info-bg` `#EEF4FA` | 6.46:1 | 4.5 | Status label, left bar |
| Success label on success background | `--color-status-success-accent` `#2E6B3F` | `--color-status-success-bg` `#EEF6F0` | 5.80:1 | 4.5 | Status label, left bar |
| Warning label on warning background | `--color-status-warning-accent` `#8A5300` | `--color-status-warning-bg` `#FFF8E6` | 5.97:1 | 4.5 | Status label, left bar, demo banner bar |
| Error label on error background | `--color-status-error-accent` `#A12B2B` | `--color-status-error-bg` `#FBEEEE` | 6.41:1 | 4.5 | Status label, left bar |
| Fact label on white | `--color-callout-fact` `#0B132B` | `--color-white` `#FFFFFF` | 18.38:1 | 4.5 | Callout label and bar |
| Estimate label on white | `--color-callout-estimate` `#7E6026` | `--color-white` `#FFFFFF` | 5.85:1 | 4.5 | Callout label and bar |
| Example label on white | `--color-callout-example` `#1D5F66` | `--color-white` `#FFFFFF` | 7.29:1 | 4.5 | Callout label and bar |
| Opinion label on white | `--color-callout-opinion` `#6B3E75` | `--color-white` `#FFFFFF` | 8.17:1 | 4.5 | Callout label and bar |
| Chart text on chart background | `--color-text` `#1C2541` | `--color-chart-bg` `#FFFFFF` | 15.10:1 | 4.5 | Values, categories, table |
| Chart series 1 on chart background | `--color-chart-series-1` `#0B132B` | `--color-chart-bg` `#FFFFFF` | 18.38:1 | 3 | Solid bars |
| Chart series 2 on chart background | `--color-chart-series-2` `#1D5F66` | `--color-chart-bg` `#FFFFFF` | 7.29:1 | 3 | Outlined bars |
| Chart axis on chart background | `--color-chart-axis` `#64748B` | `--color-chart-bg` `#FFFFFF` | 4.76:1 | 3 | Baseline |
| Strong border on white | `--color-border-strong` `#64748B` | `--color-white` `#FFFFFF` | 4.76:1 | 3 | Input, select, callout and notice boundaries |
| Strong border on alabaster | `--color-border-strong` `#64748B` | `--color-alabaster` `#F8FAFC` | 4.55:1 | 3 | Input boundaries |
| Strong border on hover background | `--color-border-strong` `#64748B` | `--color-hover-bg` `#F1F5F9` | 4.34:1 | 3 | Hovered input boundary |
| Error border on white | `--color-error` `#A12B2B` | `--color-white` `#FFFFFF` | 7.25:1 | 3 | Invalid input boundary |
| Primary button boundary on white | `--color-button-primary-bg` `#0B132B` | `--color-white` `#FFFFFF` | 18.38:1 | 3 | Primary and secondary button boundary |
| Primary button boundary on alabaster | `--color-button-primary-bg` `#0B132B` | `--color-alabaster` `#F8FAFC` | 17.57:1 | 3 | Button boundary |
| Focus ring on white | `--color-focus` `#7E6026` | `--color-white` `#FFFFFF` | 5.85:1 | 3 | Focus indicator |
| Focus ring on alabaster | `--color-focus` `#7E6026` | `--color-alabaster` `#F8FAFC` | 5.59:1 | 3 | Focus indicator |
| Focus ring on notice background | `--color-focus` `#7E6026` | `--color-notice-bg` `#FFF8E6` | 5.52:1 | 3 | Focus indicator in the notice |
| Focus ring on navy | `--color-focus-on-dark` `#C5A059` | `--color-navy` `#0B132B` | 7.48:1 | 3 | Focus indicator on navy |
| Focus ring on slate | `--color-focus-on-dark` `#C5A059` | `--color-slate` `#1C2541` | 6.15:1 | 3 | Focus indicator on slate |

## Pairs that must fail (never used)

These are the reason for the gold rule. Each is a contrast fixture in `tests/unit/design-system.test.ts` (F2-07).

| Pair | Ratio | Why it is never used |
| --- | --- | --- |
| Gold `#C5A059` on white `#FFFFFF` | 2.46:1 | Below 3:1, so gold fails even as a border or UI colour on light surfaces |
| Gold `#C5A059` on alabaster `#F8FAFC` | 2.35:1 | As above |
| Gold-on-light `#7E6026` on slate `#1C2541` | 2.58:1 | The reverse of the rule: the dark gold is for light surfaces only |

Enforcement: a PostCSS source scan (`tests/helpers/design-scan.ts`, F2-06 and F2-07), a compiled-CSS check on `dist/` and the gallery build (F2-08), and a rendered check on the gallery at 360, 768 and 1280 px (F2-09). axe also checks rendered contrast on every page.
