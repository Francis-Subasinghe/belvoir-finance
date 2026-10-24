# ADR-0003: V2 palette and typography

**Status:** Accepted for V2 (brief `docs/design/V2_BRIEF.md`, PR #44; ACs `docs/qa/AC_V2_DESIGN.md`, PR #45).
**Date:** 2026-10-23
**Supersedes:** the palette and font parts of [ADR-0002](ADR-0002-brand-colour-type.md). ADR-0002's rules on tokens, the gold-rule principle and self-hosting still apply.

## Context

Francis asked for a calmer, more editorial look in the style of a reference site (style only: palette mood, type contrast, spacing and motion). Nothing from the reference is reused: no text, logo, images, icons, code or font files.

## Decision

### Palette

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#FBFBF9` | Page background |
| Surface | `#EFEFEA` | Cards, tool panel, callouts, art panels |
| Surface 2 | `#E6E6E0` | Table header, disabled controls |
| Sand | `#D4C4A8` | Warm band (light surface) |
| Ink | `#0A0A0A` | Text, headings, primary button, ink band, footer |
| Ink muted | `#4A4A45` | Secondary text |
| Ink subtle | `#6B6B64` | Captions on canvas; strong UI borders |
| Green | `#2C5F34` | Links, line art, chart series |
| Green deep | `#1F4426` | Link and button hover, deep band |
| Gold bright | `#F2C94C` | Highlight **only on ink, green or green-deep** |
| Gold soft | `#D4C098` | Eyebrows, link underlines **only on dark surfaces** |
| Gold on light | `#7A5A0A` | Gold text and marks on light surfaces (never on dark) |
| White | `#FFFFFF` | Chart and diagram background |

Gold rule: gold-bright and gold-soft only in rules scoped under `.surface-ink`, `.surface-green` or `.surface-green-deep` (last surface class wins); gold-on-light never there. Focus: two-tone ring (3 px ink outline, 2 px canvas inner ring; gold-bright outline on dark surfaces). Ratios: `docs/design/CONTRAST.md`.

### Typography

- **Fraunces (300, 400)**, OFL-1.1, latin, static weights: display and H1/H2, card titles. Closest free match to the reference's light display serif. Replaces Source Serif 4.
- **Inter (400, 600)**, OFL-1.1: body, UI, H3 and below.
- **IBM Plex Mono (400)**, OFL-1.1: figures.

All five WOFF2 files are copied from the pinned `@fontsource` packages (`@fontsource/fraunces` 5.3.0, `@fontsource/inter` 5.3.0, `@fontsource/ibm-plex-mono` 5.3.0) into `src/fonts/<family>/`, each beside its `OFL.txt`, and their sha256 hashes are pinned in `tests/fixtures/v2/font-hashes.json` (V2-53). The build serves those copies. Metric-matched local fallbacks (`"Fraunces Fallback"`, `"Inter Fallback"`, `"IBM Plex Mono Fallback"`) keep the swap from moving layout. Only Fraunces 300 is preloaded, on the home page.

## Consequences

- `@fontsource/source-serif-4` is removed; total font bytes drop slightly (Fraunces +35.9 KB, Source Serif −40 KB).
- Surface classes are renamed: `surface-navy` → `surface-ink`, `surface-slate` → `surface-green-deep`; light surfaces are `surface-canvas`, `surface-raised`, `surface-white`, `surface-sand`.
- The gold-rule scanner, token test and contrast table move to these tokens.
