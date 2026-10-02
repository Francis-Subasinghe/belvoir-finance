# Product requirements summary (MVP)

**Promise:** Business finance, made clear.
**Publisher:** Belvoir Finance (the relationship is disclosed; the publication is not described as independent).
**Status:** Draft v0.1, derived from the owner's project brief of 30 Sep 2026.

## Reader
UK founders and operators of growing SMEs who make finance decisions without a finance background. The working lens is roughly £500k–£5m ARR, but that is not an entry requirement. Secondary readers are new finance or ops hires and owners building their financial literacy. The MVP serves a single audience.

## Outcome
After a visit, a reader understands one finance idea or change well enough to ask a better question, read their numbers with more confidence, or explore a decision.

## Content pillars
1. Understand the numbers (P&L, balance sheet, cash flow, working capital, runway).
2. Make better decisions (pricing, hiring, spending, funding, scenarios).
3. Finance in context: verified UK policy or reporting changes, and why they matter.
4. Build capability: guides, glossary, learning paths.

## MVP scope (in)
- Pages: Home, Explore, Topic, Story, Tools (one tool), Source library, About, Editorial standards, Newsletter, Contact, Privacy/Cookies/Terms.
- Story metadata: title, summary, reader, tags, author, reviewer, first-published and last-reviewed dates, jurisdiction, tax year or period, sources, and fact/estimate/example/opinion labels.
- One interactive tool, the **cash-versus-profit explorer**. It is illustrative only, collects no data, and handles blank, invalid and extreme inputs.
- A source registry, plus feed intake into a review queue that publishes nothing automatically.
- Newsletter signup with double opt-in and consent, and no non-essential cookies before consent.
- Technical SEO: pre-rendered text, sitemap, canonical URLs, Open Graph tags, Article structured data.

## Out of scope (MVP)
Reader accounts, payments, ads, affiliates, a client portal, accounting integrations, personalised advice, investment calls, auto-published AI summaries, and service pricing. A "Work with Belvoir" link is included only if the owner confirms it (D4).

## Quality bar
- Accessibility: zero serious or critical axe issues on every template, a full keyboard path through both journeys, and WCAG 2.2 AA contrast.
- Performance: Lighthouse at least 90 in every category on mobile, LCP under 2.5 s and CLS under 0.1.
- Content: a site-wide "Educational information, not financial advice" notice, a CI warning for any `nextReviewDue` in the past, and the editorial checklist from the brief (§7.4) on every story PR.
- Demo content is flagged `demo: true`, which shows a visible banner and sets `noindex`.
- No unverified claims. Aegis must report no open Critical or High findings, and all CI checks must be green.

## Measures
Learning-path completion, return visits, newsletter opt-ins, source-link clicks, tool completions and error rate, search impressions and clicks, and review freshness. Targets are set only once baseline data exists. Measurement needs the analytics decision (D6), so until then only the build-time checks apply.
