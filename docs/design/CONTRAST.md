# Contrast table (F1-24, F1-25)

Measured with the WCAG 2.x formula in `src/lib/contrast.ts`. The same pairs are asserted in `tests/unit/design-tokens.test.ts`, so CI fails if a token changes and a pair drops below its minimum. Tokens live only in `src/styles/tokens.css`.

| Pair used by the F1 shell | Ratio | Minimum |
| --- | --- | --- |
| Body text (slate `#1C2541`) on alabaster `#F8FAFC` | 14.44:1 | 4.5 |
| Body text on white | 15.10:1 | 4.5 |
| Muted text `#4A5568` on alabaster | 7.19:1 | 4.5 |
| Headings (navy `#0B132B`) on alabaster | 17.57:1 | 4.5 |
| Gold-on-light `#7E6026` on white (links, eyebrow, callout label, focus ring) | 5.85:1 | 4.5 |
| Gold-on-light `#7E6026` on alabaster | 5.59:1 | 4.5 |
| Gold `#C5A059` on navy (header links) | 7.48:1 | 4.5 |
| Gold `#C5A059` on slate (footer accent and links) | 6.15:1 | 4.5 |
| Alabaster text on navy (header) | 17.57:1 | 4.5 |
| Alabaster text on slate (footer) | 14.44:1 | 4.5 |
| Notice text `#5C4511` on notice background `#FFF8E6` | 8.56:1 | 4.5 |
| Gold-on-light `#7E6026` on notice background `#FFF8E6` (links or focus ring inside the not-advice notice) | 5.52:1 | 4.5 |
| Strong border `#64748B` on white (callout rule, demo banner) | 4.76:1 | 3 |
| Focus ring `#7E6026` on alabaster / `#C5A059` on navy | 5.59:1 / 7.48:1 | 3 |

**Not used anywhere:** gold `#C5A059` on white (2.46:1) or alabaster (2.35:1). A unit test fails if the `#C5A059` literal appears outside `tokens.css`, or if `var(--color-gold)` is used in any CSS rule not scoped to `.surface-navy` or `.surface-slate`. axe (Playwright, `npm run test:e2e`) also checks rendered colour contrast at 360, 768 and 1280 px.
