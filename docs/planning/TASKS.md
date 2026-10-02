# MVP task breakdown

Branch naming: `feat/<area>`, `docs/<area>`, `ci/<area>`. Every PR needs green CI, a Sentinel PASS, and an Aegis verdict with no open Critical or High findings.

## Launchpad
- **L1** Turn on repo security: secret scanning with push protection, Dependabot alerts, and branch protection on `main` (PR required, required checks, no force-push).
- **L2** Set up CI with format, lint, typecheck, unit tests, `astro build`, `npm audit`/dependency review, and CodeQL.
- **L3** Add a GitHub Pages preview workflow, with deploy notes and rollback steps in `docs/ops/`.
- **L4** Add the scheduled feed-intake workflow skeleton, triggered manually first, with least-privilege permissions.

## Forge
- **F1** Scaffold Astro and TypeScript, with Keystatic config for the content model, a strict CSP, security headers and the design tokens (navy, slate, gold, alabaster; serif headings, sans body, monospaced numerals).
- **F2** Build the design system: story card, article header, source note, fact/estimate/example/opinion callouts, chart wrapper, form controls, status notice, navigation and footer.
- **F3** Build the pages in the sitemap, with clearly marked demo content.
- **F4** Build the cash-versus-profit explorer, with pure calculation logic, unit tests, and keyboard and screen-reader support.
- **F5** Seed the source registry with about 10 verified entries (aiming for about 50 over time). Build the intake parser module with hardening tests.
- **F6** Build the newsletter signup UI with double opt-in, a consent checkbox and a bot-check placeholder, behind a provider interface.
- **F7** Add SEO: sitemap, robots, canonical URLs, Open Graph tags and Article JSON-LD that matches the visible content.

## Sentinel
- **S1** Write acceptance criteria for every F task in `docs/qa/`, before Forge builds it.
- **S2** Test both primary journeys on mobile and desktop, plus accessibility checks (axe, keyboard).
- **S3** Write the explorer's calculation test table, covering blank, invalid and extreme inputs.
- **S4** Check that metadata renders correctly: dates, author, reviewer, sources and status.

## Aegis
- **A1** Write a threat model for feed intake, rendering, CMS admin and newsletter.
- **A2** Review every PR, reporting findings by severity with file and line, the evidence and the fix.
- **A3** Run a pre-preview audit covering headers, CSP, dependencies and the privacy data flow.

## Atlas
- **X1** Keep the PRD, ADRs and open decisions current, and check each PR for architectural fit.
- **X2** Merge PRs when every gate is green, and send Francis a plain-English status after each milestone.

## Order
L1 → F1 + L2 → S1 (for F2–F4) → F2 → F3 + F4 → F5 + L4 → F6 → F7 → A3 + S2 → L3 preview.
