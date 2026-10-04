# ADR-0002: Brand colour and typography

**Status:** Accepted (Atlas). It has no cost and needs no account.
**Date:** 2026-10-04

## Context
TASKS F1 and `docs/qa/TEST_STRATEGY.md` set out the brand palette and the gold contrast rule, but no ADR recorded them. F2 (the design system) turns them into tokens, so this ADR becomes the single source that later work cites.

## Decision

### Palette
| Token | Value | Use |
| --- | --- | --- |
| Navy | `#0B132B` | Header, footer, feature bands, primary buttons |
| Slate | `#1C2541` | Body text on light surfaces, secondary dark surfaces |
| Gold | `#C5A059` | Accents **only on navy or slate** (7.48:1 on navy, 6.15:1 on slate) |
| Gold on light | `#7E6026` | Gold-toned text, links and focus rings on light surfaces (5.85:1 on white, 5.59:1 on alabaster) |
| Alabaster | `#F8FAFC` | Page background |
| White | `#FFFFFF` | Cards, charts |

### The gold rule
- `#C5A059` never appears as text or as a meaningful UI colour on white or alabaster. It measures only 2.46:1 and 2.35:1 there.
- `#7E6026` never appears on navy or slate (2.58:1 on slate). On dark surfaces, use `#C5A059`.
- The rule is enforced by the F2-06 to F2-09 checks in `docs/qa/AC_F2_DESIGN_SYSTEM.md`: a source scan with a CSS parser, failing fixtures, a compiled-CSS check and a rendered-page check.

### Supporting colours
F2 adds status colours (info, success, warning, error), callout accents (fact, estimate, example, opinion), chart series and state colours. They are defined in `src/styles/tokens.css`, and every text and UI pair is listed with its measured ratio in the design system's contrast doc. New colours are added there, never hard-coded in components.

### Typography
- **Headings:** Source Serif 4 (600, 700).
- **Body and UI:** Inter (400, 600).
- **Numerals and data:** IBM Plex Mono (400), plus `tabular-nums` for figures in tables.
- All fonts are self-hosted from `@fontsource` packages, pinned exactly, as Latin `woff2` subsets with `font-display: swap`. No third-party font CDN is used, which keeps the CSP same-origin and leaves no tracking.
- All three families are under the SIL Open Font License 1.1.

## Consequences
- Any brand change (D3) is a token edit plus a contrast re-check, not a component rewrite.
- Adding a font weight or family costs page weight and must stay inside the TEST_STRATEGY performance budgets.
