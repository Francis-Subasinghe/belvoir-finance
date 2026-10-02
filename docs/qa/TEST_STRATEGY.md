# QA test strategy (MVP)

**Owner:** Sentinel (QA), task S1 in `TASKS.md`. **Status:** Draft v0.1, derived from the owner's project brief of 30 Sep 2026 and the merged `PRD.md`, `ADR-0001-platform.md`, `CONTENT_MODEL.md` and `TASKS.md`.
**Scope:** How every MVP task is verified, which checks block a merge, and when the MVP counts as done. Security testing is owned by Aegis and is referenced, not repeated, here.

## Principles
- Every task has numbered, objectively testable acceptance criteria in `docs/qa/AC_<task>.md`, written **before** Forge starts the task.
- A check that did not run is reported as **not run**, never as passed (`AGENTS.md` rule 7).
- Deterministic checks run in CI. Manual checks are recorded in the PR with the build or commit tested, the browser and the viewport.
- Defects are reported with severity (Blocker, Major, Minor, Trivial), steps to reproduce, expected and actual results, and the commit tested.

## Test layers and tools
| Layer | Tool | What it covers | Runs in |
| --- | --- | --- | --- |
| Format and lint | Prettier, ESLint (with `eslint-plugin-astro`, `jsx-a11y`) | Code style, obvious a11y mistakes in markup | CI, every PR |
| Type check | `astro check` + `tsc --noEmit` | Types, content-collection schemas | CI, every PR |
| Unit | Vitest | Pure logic: explorer calculations, intake parser, content helpers | CI, every PR |
| Content schema | Astro content collections (Zod) + a repo script | Required metadata, status values, no `.mdx` under `content/` | CI, every PR |
| Build | `astro build` | Site builds; `dist/` assertions (no `keystatic` path, no non-`published` entries) | CI, every PR |
| Search index | Pagefind (F9, D13) | Index builds from `dist/`; results only from `published` entries | CI, every PR from F9 on |
| End-to-end | Playwright (Chromium, WebKit, Firefox) | Primary journeys, navigation, forms, explorer, at the three breakpoints | CI, every PR touching `src/` or `content/` |
| Accessibility | `@axe-core/playwright` + manual keyboard and screen-reader pass | WCAG 2.2 AA | Automated in CI; manual before preview (S2) |
| Visual regression | Playwright screenshots | Layout drift on key templates at the three breakpoints | CI, non-blocking until the design system (F2) is approved |
| Performance, SEO, best practices | Lighthouse CI against the built site | Budgets below | CI, every PR touching `src/` |
| Review freshness | Repo script (F10) | Lists every story whose `nextReviewDue` is in the past | CI, every PR and weekly; **warning only** |
| Links | lychee | Internal links (blocking) and external links (report only) | CI, every PR; external links also weekly |
| Dependencies and code scanning | `npm audit` / dependency review, CodeQL (L2) | Known vulnerabilities | CI, every PR (Launchpad) |

## Merge-blocking checks
A PR cannot merge unless all of the following pass. Launchpad makes them required status checks on `main` (L1/L2), with "Do not allow bypassing" on, so admins are bound too (ADR-0001, requirement 5).
1. Format, lint and type check.
2. Unit tests, with no skipped tests unless a linked issue explains why.
3. Content-schema check, including the no-`.mdx`-under-`content/` check (L2).
4. `astro build` plus the `dist/` assertions, including no `keystatic` path (L2).
5. Playwright e2e and the automated axe scan (zero serious or critical violations).
6. Lighthouse CI budgets (all four categories, from the PRD quality bar).
7. Internal link check.
8. Dependency review and CodeQL with no new High or Critical alerts.
9. Sentinel PASS recorded on the PR, and an Aegis verdict with no open Critical or High findings.

**Report only (non-blocking):** visual regression until F2 is approved, the external link check, and the overdue-review warning (F10).

**Not testable on the preview:** response headers. GitHub Pages can't send them, which ADR-0001 accepts as a preview-only limitation. The header assertion becomes merge-blocking once the header-capable host from D5 exists.

## Breakpoints and browsers
| Name | Viewport (CSS px) | Represents |
| --- | --- | --- |
| Mobile | 360 × 800 | Small Android phone, mobile-first baseline |
| Tablet | 768 × 1024 | Portrait tablet |
| Desktop | 1280 × 800 | Laptop |

At each breakpoint: no horizontal scroll at the page level, no clipped or overlapping text, tap targets usable, and navigation reachable. Browsers: latest Chromium, WebKit and Firefox through Playwright; manual spot checks in Chrome and Safari on iOS.

## Accessibility thresholds (WCAG 2.2 AA)
- axe: **0** serious or critical violations on every built page template.
- Text contrast **≥ 4.5:1**; large text (≥ 24 px, or ≥ 18.66 px bold) and UI components or focus indicators **≥ 3:1**.
- Brand gold `#C5A059` is used **only on navy (7.48:1) or slate (6.15:1)**. On white or alabaster it measures 2.46:1 and 2.35:1, so gold text on light surfaces uses `#7E6026` (5.85:1 on white, 5.59:1 on alabaster), per F1 in `TASKS.md`.
- Every interactive element is reachable and operable by keyboard alone, in a logical order, with a visible focus indicator that is not obscured (2.4.11).
- Target size **≥ 24 × 24 px** (2.5.8).
- A skip link, one `h1` per page, landmark regions and `lang="en-GB"`.
- Information is never conveyed by colour alone; charts have a text equivalent.
- `prefers-reduced-motion` disables non-essential motion.
- Content reflows at 320 px width and at 200 % zoom without loss of content.

## Performance budgets
Measured by Lighthouse CI (mobile preset, median of 3 runs) on the built site:
| Metric | Budget |
| --- | --- |
| Lighthouse Performance | ≥ 90 |
| Lighthouse Accessibility | ≥ 90 (axe remains the stricter gate) |
| Lighthouse Best Practices | ≥ 90 |
| Lighthouse SEO | ≥ 90 (measured with `noindex` disabled, since the preview sets it on purpose) |
| Largest Contentful Paint | < 2.5 s |
| Cumulative Layout Shift | < 0.1 |
| Total Blocking Time (lab proxy for INP) | < 200 ms |
| JavaScript per editorial page (compressed) | ≤ 50 KB |
| JavaScript on `/tools/cash-vs-profit` (compressed) | ≤ 120 KB |

## Content-correctness checks
- Required story metadata from `CONTENT_MODEL.md` renders visibly: author, reviewer (for factual finance items), first-published and last-reviewed dates, jurisdiction and period where relevant, and sources with accessed dates.
- The site-wide "Educational information, not financial advice" notice (F10) appears on every page.
- Illustrative examples are labelled as such.
- Entries with `demo: true` show a visible demo banner and set `noindex` (F10).
- Any `nextReviewDue` in the past raises a CI warning (F10).
- Every story PR includes the editorial checklist from the brief (§7.4): draft, source verification, subject review where appropriate, copy and accessibility review, publish, scheduled review.
- "What changed" items (F8) show only published briefings, each with its source, date and Belvoir's explanation.
- Feed intake follows the failure modes in `CONTENT_MODEL.md`: dead or non-200 feeds are skipped with `lastError` recorded, malformed XML is never partially imported, duplicates are removed, paused or retired sources are never fetched, and `rights: unknown` stores the title and link only.

## Verifier per task
| Task | AC doc | Primary verifier | Also checked by |
| --- | --- | --- | --- |
| L1 Repo security | Settings checklist on the PR (owner settings) | Launchpad | Aegis |
| L2 CI (ships inside the F1 PR) | `docs/qa/AC_F1_SCAFFOLD.md` (F1-18 to F1-21) | Launchpad | Sentinel, Aegis |
| L3 Preview workflow | `docs/qa/AC_L3.md` (to write) | Launchpad | Sentinel (smoke test), Aegis (A3) |
| L4 Feed-intake workflow | `docs/qa/AC_L4.md` (to write) | Aegis | Sentinel |
| F1 Scaffold | `docs/qa/AC_F1_SCAFFOLD.md` | Sentinel | Aegis, Launchpad |
| F2 Design system | [`docs/qa/AC_F2_DESIGN_SYSTEM.md`](AC_F2_DESIGN_SYSTEM.md) | Sentinel | Atlas (design fit, D12 wireframes) |
| F3 Pages | `docs/qa/AC_F3.md` (to write) | Sentinel | Atlas |
| F4 Cash-vs-profit explorer | `docs/qa/AC_F4.md` + S3 calculation table (to write) | Sentinel | Aegis |
| F5 Source registry and parser | `docs/qa/AC_F5.md` (to write) | Sentinel (failure modes) | Aegis (hardening fixtures) |
| F6 Newsletter UI | `docs/qa/AC_F6.md` (to write) | Sentinel | Aegis |
| F7 SEO | `docs/qa/AC_F7.md` (to write) | Sentinel | Atlas |
| F8 "What changed" display | `docs/qa/AC_F8.md` (to write) | Sentinel | Atlas |
| F9 Pagefind search | `docs/qa/AC_F9.md` (to write) | Sentinel | Aegis |
| F10 Not-advice notice, demo banner, overdue warning | `docs/qa/AC_F10.md` (to write) | Sentinel | Atlas |
| S1–S4 | This document; results recorded on the relevant PR | Sentinel | Atlas |
| A1–A3 | Aegis's own reports | Aegis | Atlas |
| X1–X2 | Up-to-date docs and merge log | Atlas | Francis |

`TASKS.md` names AC files as `docs/qa/AC_<task>.md`. F1 keeps its descriptive name because `TASKS.md` links to `AC_F1_SCAFFOLD.md` directly, and F2 uses `AC_F2_DESIGN_SYSTEM.md` as the team asked; the others use the bare task ID until a task links a different name.

## Definition of done (copied from the brief, §17)
The MVP is ready for preview when:
- The public experience communicates the education-first proposition.
- Home, topic, article, source, about/editorial and newsletter journeys work on mobile and desktop.
- At least one interactive learning feature works with invalid, empty and extreme inputs handled.
- Editorial content supports sources, author, reviewer, jurisdiction and review dates.
- External feed items are safely parsed, attributed and held for review before publication.
- Search-readable article content, metadata, internal links, sitemap and canonical behaviour are verified.
- Formatting, lint, type, test and build checks pass.
- Sentinel's critical user journeys pass.
- Aegis reports no unresolved Critical or High security findings.
- Launchpad provides a preview, configuration instructions and rollback guidance.
- No unverified credentials, testimonials, customer results, certifications, service prices or legal claims are present.
- No production domain or paid vendor change has occurred without authorisation.

**Per-task done:** every AC in the task's AC doc passes or has an accepted, documented exception; all merge-blocking checks are green; Sentinel PASS and Aegis verdict are recorded on the PR.
