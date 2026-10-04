# Belvoir Finance

**Business finance, made clear.**

An education-first publication explaining business finance, accounting and financial decision-making for UK founders and operators. Belvoir's original explanations, visuals and interactive lessons are the product; external sources are research inputs, never a mirrored feed.

> Status: F1 scaffold (static Astro site, demo content only). No production site.

## Where things live

| Path                      | What it is                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md`               | Working rules for the agent team (read first)                                 |
| `docs/planning/`          | Product requirements, sitemap, content model, task breakdown                  |
| `docs/decisions/`         | Architecture decision records (ADRs) and the open-decisions log               |
| `docs/qa/`                | Test strategy and acceptance criteria                                         |
| `docs/design/CONTRAST.md` | Measured colour-contrast table for the design tokens                          |
| `content/`                | Markdoc stories (`.mdoc`) and YAML/JSON data, edited with Keystatic locally   |
| `src/`                    | Astro site: layouts, components, pages, content schemas, helpers              |
| `tests/`                  | `unit/` (Vitest), `build/` (assertions on `dist/`), `e2e/` (Playwright + axe) |
| `.github/`                | CI workflow and Dependabot config (owned by Launchpad)                        |
| `.env.example`            | Environment variable names with placeholder values only                       |

## Developing

Requires the Node version in `.nvmrc` (Node 24, also pinned in `package.json` `engines`).

```sh
npm ci                 # install exactly what package-lock.json pins
npm run dev            # site at http://127.0.0.1:4321/belvoir-finance/ (localhost only)
npm run keystatic      # Keystatic admin at http://127.0.0.1:4321/keystatic (localhost only)
npm run dev:gallery    # component gallery at http://127.0.0.1:4322/belvoir-finance/design/ (dev only)
npm run format:check   # Prettier
npm run lint           # ESLint (TypeScript, Astro, jsx-a11y rules)
npm run typecheck      # astro check + tsc --noEmit (strictest)
npm test               # Vitest unit tests, including the content checks
npm run build          # astro build to dist/, then the dist/ assertions (postbuild)
npm run build:gallery  # gallery test build to dist-gallery/ (never deployed) + its assertions
npm run test:e2e       # build:gallery, then Playwright + axe at 360/768/1280 px on dist/ and dist-gallery/
                       # (run `npm run build` first; needs `npx playwright install chromium` once)
npm run test:visual    # gallery screenshot comparison, blocking in CI (F2-38; baselines come only from the CI
                       # "visual-baselines" artifact: `git add -f` them, then run `npm run visual:manifest`)
npm run visual:manifest -- --run <id> --artifact <id> --commit <sha>
                       # rewrite tests/visual/BASELINES.sha256 from the tracked *-linux.png baselines
npm run wireframes     # regenerate the D12 wireframe screenshots in docs/design/wireframes/
npm run check:content  # no .mdx, Markdoc allowlist, no raw HTML, safe links
npm run check:visual-baselines  # committed visual baselines match tests/visual/BASELINES.sha256 (only *-linux.png; warns on untracked local renders)
npm run verify         # everything above except e2e
```

### Keystatic (local mode only)

`npm run keystatic` starts the dev server with the Keystatic admin enabled. Edits are written straight to `content/` on your machine; commit them on a branch and open a PR like any other change. Keystatic uses `storage: { kind: 'local' }` only: there is no GitHub mode, GitHub App or session secret. Keystatic's admin calls a fixed `/api/keystatic` path, so in this mode the site is served from `/` rather than `/belvoir-finance/`. Keystatic is never loaded by `astro build`, and a build test fails if anything containing `keystatic` reaches `dist/`.

### Component gallery (dev and tests only)

The F2 component gallery (`/design/`) and the D12 wireframes (`/design/wireframes/<page>/`) exist only when `BELVOIR_GALLERY=1` is set, which only `scripts/gallery.ts` does (`npm run dev:gallery`, `build:gallery`, `preview:gallery`). `npm run build` never sets it, and a build test fails if anything from the gallery reaches `dist/`. The gallery runs on port 4322 so it can run alongside `npm run dev`. See `docs/design/DESIGN_SYSTEM.md`.

All dev and preview servers bind to `127.0.0.1`. Never add `--host` or `0.0.0.0`; CI rejects it.

## Content rules

- Stories are **Markdoc only** (`content/stories/*.mdoc`). MDX is not installed, and CI fails on any `.mdx` file under `content/`.
- The only Markdoc tag is `{% callout type="fact|estimate|example|opinion" %}` (allowlist in `src/lib/markdoc-allowlist.ts`). Unknown tags and raw HTML fail `npm test` and `npm run check:content`.
- External links must be `https`; they render with `rel="noopener noreferrer"`. Other schemes are refused.
- Only entries with `status: published` are built. `demo: true` shows a demo banner and sets `noindex` on that page.
- All JSON-LD goes through `src/lib/jsonld.ts` (`<JsonLd>`), which escapes `<`, `>` and `&`.
- People in the repo are placeholders until D8. No real names, emails or credentials.

### F3 content rules (checked by `astro build` and `npm run check:content`)

One function, `checkContentRules()` in `src/lib/content-rules.ts`, validates all of `content/` with the Zod schemas in `src/content/schemas.ts` and then the cross-entry rules. `astro build` fails on any error (the `belvoir-content-rules` integration in `astro.config.mjs`); `astro dev` only logs them. Field-by-field rules are in `docs/planning/CONTENT_MODEL.md`. In short:

- **Ids** are the file name (lowercase slug), unique ignoring case; no `slug:` key. Retired ids are never reused.
- **References** (story topics, author, reviewer, sources, related stories and tools; topic reading path and featured tool; tool reviewer and source record; source owner — 11 reference types) must name an entry in the right collection. A reference to an entry that exists but isn't published is a **warning**; the target is left out of the page.
- **Required booleans with no default:** `demo` on every Story, Topic, Tool, Person and Source; `factual` and `commercialInterest` on every Story.
- A published factual story needs a `reviewer`, who isn't the author. `commercialInterest: true` needs a non-blank `disclosure`.
- **Dates** are real `YYYY-MM-DD` dates. Once published, `firstPublished` and `lastReviewed` are required, `lastReviewed` ≥ `firstPublished`, and `nextReviewDue` > `lastReviewed`. Nothing compares a date with today, so the build is the same on any day and in any time zone.
- **Pillars** are the fixed list in `PILLARS`. **Jurisdiction** is UK, IE, EU, US or `other`; `other` needs a `jurisdictionNote`, and any other value must not have one.
- **Demo:** a story by a demo person, or citing a demo source, must be demo; a demo story cites only demo sources on placeholder URLs. A demo source says "(placeholder)" in its name and links only to example.org, example.com, example.net or a `.invalid` host.
- **People:** credentials render only when `verified: true` (which needs `verifiedBy` and `verifiedOn`; none is committed while D8 is open). Labels, `role` and `bio` must not contain a protected title or membership (`PROTECTED_CREDENTIAL_TERMS`); reword a false positive, don't add an exception.

**Reading a failure.** Every problem is printed, one per line, as `file: field: message [rule]`, for example

```
content/stories/x.mdoc: reviewer: a published factual story needs a reviewer [schema]
content/stories/x.mdoc: sources[1].source: no Source with id "hmrc" (content/sources/hmrc.yaml) [ref-missing]
warning: content/topics/y.yaml: readingPath[2]: "z" is not published (status: draft), so it is left out of the page [ref-unpublished]
```

The field path points at the exact value (`sources[1].source` is the second source's id). Fix the file and run `npm run check:content` again. Fixtures for every rule live in `tests/fixtures/content/` (`base/` is a full valid set; each `negative/<case>/` overrides one file) and are never copied into `content/`.

## Preview, search engines and security headers

- **Preview setting:** `PUBLIC_PREVIEW` (default: on). While on, every page has `<meta name="robots" content="noindex, nofollow">` and `robots.txt` disallows all crawling. Set `PUBLIC_PREVIEW=false` only when the owner approves a launch (D1).
- **Base path:** the GitHub Pages preview is served from `/belvoir-finance/` (`astro.config.mjs`).
- **CSP:** production builds include a strict Content Security Policy as a `<meta>` tag (`src/config/site.ts`): `script-src 'self'`, no inline scripts or styles, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. The dev server omits it because Vite injects inline scripts.
- **Accepted preview-only limitation (ADR-0001, Hosting / Aegis M1):** GitHub Pages cannot send response headers, so the preview has **no** HSTS, `frame-ancestors` (clickjacking protection) or `X-Content-Type-Options`. A meta-tag CSP cannot set `frame-ancestors`. This repo does **not** ship a `_headers` file and makes no claim that headers are active. Before launch, the site moves to a header-capable host (D5) and CI asserts the headers on the deployed page.

## Ground rules

- This repository is **public**. Never commit secrets, tokens, real personal contact details or unreviewed content.
- All work happens on feature branches and reaches `main` through a pull request that passes CI, QA (Sentinel) and security review (Aegis).
- No purchases, DNS/registrar changes, visibility changes or production publishing without explicit owner authorisation.
