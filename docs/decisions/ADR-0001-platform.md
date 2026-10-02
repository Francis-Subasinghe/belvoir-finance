# ADR-0001: Content platform and architecture

**Status:** Proposed (Atlas). Needs owner sign-off only for any paid service or hosting account.
**Date:** 2026-10-02

## Options compared

| Criterion | A. Astro static site + Git-based CMS (Keystatic) | B. Next.js + hosted headless CMS (e.g. Sanity) |
| --- | --- | --- |
| Publishing ease | Keystatic gives editors a visual editor that writes Markdoc/MDX to the repo | Sanity Studio is excellent for editors |
| Search rendering | Fully pre-rendered HTML, so crawlers see all text | SSR/SSG works, but needs care to stay static |
| Preview, roles, versioning | Drafts are branches, review is a PR and history is git. Roles come from GitHub permissions | Native drafts, roles and history (some features are paid tiers) |
| Interactive components | Astro "islands" load JS only for tools | React everywhere, so a heavier baseline |
| Hosting and operations | Any static host. No server or database | Needs a Node host and a CMS vendor account |
| Cost and lock-in | Free and portable, since content is plain files in git | Vendor plan, with content held in the vendor's store |
| Custom domain later | Trivial on any static host | Supported |

## Decision
Choose **A: Astro + TypeScript + Keystatic (Git mode)**, delivered as a static site.

- **Interactives:** Astro islands. The calculation logic lives in pure TypeScript modules with unit tests.
- **Editorial workflow:** draft branch → PR → Sentinel and Aegis review plus editorial sign-off → merge to publish. Publication state (`draft | review | approved | published`) is stored in frontmatter, and the build excludes anything not `published`.
- **Hosting:** GitHub Pages for the first preview (free, because the repo is public). Per-PR preview hosting is open decision D5.
- **Feed intake:** a scheduled GitHub Action reads feed URLs **only from the source registry** and parses them with a hardened XML parser. It turns external entities and DTDs off and enforces size, time and redirect limits, plus an https-only allowlist. It stores items as **plain text** and opens a PR into `content/source-items/` with status `queued`. Nothing is published automatically, there's no runtime server, and nothing is ever fetched from links found inside items.

## Security requirements (from Aegis, binding)
1. **Feed intake:** server-side parsing only, with the hardening above. Items are stored as plain text, feed HTML is never rendered, and fetches never leave the registry (to prevent SSRF).
2. **Rendering:** CMS rich text passes an allowlist sanitiser. External links are https-only with `rel="noopener noreferrer"`. A strict Content Security Policy ships from the first page shell, with no inline scripts.
3. **CMS admin:** least privilege through GitHub repo roles and branch protection on `main`, with MFA required on every editor account. Draft content stays off public builds.
4. **Newsletter and analytics:** double opt-in, rate limiting and a bot check on signup. No non-essential cookies or analytics before consent.
5. **Repository (public):** secret scanning with push protection, Dependabot alerts, and branch protection with required checks.

## Consequences
- Content is portable Markdown, and editors need GitHub accounts. The owner may later want a non-GitHub editor login. That would mean revisiting with option B or Keystatic Cloud.
- A static build means the newsletter signup needs a provider's hosted endpoint or a small serverless function (D6).
