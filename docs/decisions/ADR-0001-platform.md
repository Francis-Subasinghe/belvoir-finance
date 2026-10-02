# ADR-0001: Content platform and architecture

**Status:** Proposed (Atlas). Needs owner sign-off only for any paid service or hosting account.
**Date:** 2026-10-02

## Options compared

| Criterion | A. Astro static site + Git-based CMS (Keystatic) | B. Next.js + hosted headless CMS (e.g. Sanity) |
| --- | --- | --- |
| Publishing ease | Keystatic gives editors a visual editor that writes Markdoc to the repo | Sanity Studio is excellent for editors |
| Search rendering | Fully pre-rendered HTML, so crawlers see all text | SSR/SSG works, but needs care to stay static |
| Preview, roles, versioning | Drafts are branches, review is a PR and history is git. Roles come from GitHub permissions | Native drafts, roles and history (some features are paid tiers) |
| Interactive components | Astro "islands" load JS only for tools | React everywhere, so a heavier baseline |
| Hosting and operations | Any static host. No server or database | Needs a Node host and a CMS vendor account |
| Cost and lock-in | Free and portable, since content is plain files in git | Vendor plan, with content held in the vendor's store |
| Custom domain later | Trivial on any static host | Supported |

## Decision
Choose **A: Astro + TypeScript + Keystatic (local mode for the MVP)**, delivered as a static site. Content is **Markdoc only** with an allowlist of tags, and `content/` contains no MDX.

- **Interactives:** Astro islands. The calculation logic lives in pure TypeScript modules with unit tests.
- **Editorial workflow:** draft branch → PR → Sentinel and Aegis review plus editorial sign-off → merge to publish. Publication state (`draft | review | approved | published | retired`) is stored in frontmatter, and the build excludes anything not `published`.
- **Hosting:** GitHub Pages for the first preview only (free, because the repo is public). **Accepted preview-only limitation:** Pages can't send response headers, so there's no HSTS, `frame-ancestors` or `X-Content-Type-Options`, and the preview gets a meta-tag CSP only. **Before launch,** we move to a host that supports a `_headers` file (Cloudflare Pages or Netlify, open decision D5), and a CI check asserts the headers on the deployed page.
- **Feed intake:** a scheduled GitHub Action reads feed URLs **only from the source registry** and parses them with a hardened XML parser. It turns external entities and DTDs off and enforces size, time and redirect limits, plus an https-only allowlist. It stores items as **plain text** and opens a PR into `content/source-items/` with status `queued`. Nothing is published automatically, there's no runtime server, and nothing is ever fetched from links found inside items.

## Security requirements (from Aegis, binding)
0. **CMS mode:** Keystatic runs in local mode. The `/keystatic` route and its admin assets never reach a production build, and a build test asserts that `dist/` contains no `keystatic` path. If GitHub mode is adopted later, its app client secret and session secret live only in the host's secret store, behind a server function, under a new ADR.
0b. **Markdoc only:** CI fails if any `.mdx` file exists under `content/`. The Markdoc schema rejects unknown tags and raw HTML.
1. **Feed intake:** server-side parsing only, with the hardening above. Items are stored as plain text, feed HTML is never rendered, and fetches never leave the registry (to prevent SSRF).
2. **Rendering:** CMS rich text passes an allowlist sanitiser. External links are https-only with `rel="noopener noreferrer"`. A strict Content Security Policy ships from the first page shell, with no inline scripts.
3. **CMS admin:** least privilege through GitHub repo roles and branch protection on `main`, with MFA required on every editor account. Draft content stays off public builds.
4. **Newsletter and analytics:** double opt-in, rate limiting and a bot check on signup. No non-essential cookies or analytics before consent.
5. **Repository (public):** secret scanning with push protection, Dependabot alerts, and branch protection with required checks. **"Do not allow bypassing" is on, so admins are bound by the rules too.** Bots push with the fine-grained `belvoir-finance` token, which has no admin rights, never the owner's signed-in account.
6. **Feed-workflow trust boundary:** feed text is data. Items are written as JSON with a real serialiser, never as Markdown or front matter. Feed values are never interpolated into `run:` steps or `${{ }}` expressions. The intake job token has only `contents: write` and `pull-requests: write`, and PR titles and branch names are fixed. Parser fixtures cover `${{ }}`, `---`, `{% %}`, `<script>`, an XML entity bomb, an oversized feed and a redirect to `http://169.254.169.254`, and each must be rejected or neutralised.
7. **CI hardening:** the default workflow token is read-only, and third-party Actions are pinned to commit SHAs.
8. **Signup bot check:** the Turnstile secret is verified server-side, either by the newsletter provider's hosted form or by a serverless function. That choice is open decision D6.

## Consequences
- Content is portable Markdoc, and editors need GitHub accounts. The owner may later want a non-GitHub editor login. That would mean revisiting with option B or Keystatic Cloud.
- A static build means the newsletter signup needs a provider's hosted endpoint or a small serverless function (D6).
