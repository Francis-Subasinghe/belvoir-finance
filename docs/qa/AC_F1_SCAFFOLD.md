# Acceptance criteria: F1 scaffold

**Task:** F1 in `TASKS.md`: Astro + TypeScript scaffold, Keystatic in local mode, Markdoc-only content schema, meta-tag CSP and design tokens. It also carries `ci.yml` from L2.
**Verifier:** Sentinel. **Also checked by:** Aegis (F1-14 to F1-17, F1-30 to F1-32), Launchpad (F1-18 to F1-21).
**Status:** Draft v0.1. Follows `ADR-0001-platform.md` (security requirements 0, 0b, 2, 7 and the accepted Pages limitation) and `TEST_STRATEGY.md`.

Each criterion has a check type: **CI** (automated, merge-blocking), **Build** (assertion on `dist/`), or **Manual** (recorded in the PR with the commit tested).

## Build and toolchain
| ID | Criterion | Check |
| --- | --- | --- |
| F1-01 | `npm ci` succeeds on a clean clone with the committed lockfile, on the Node version pinned in `.nvmrc` and `package.json` `engines`. | CI |
| F1-02 | `npm run build` (`astro build`) exits 0 and writes a static site to `dist/` with no server output. | CI |
| F1-03 | The project uses Astro with TypeScript in `strict` mode; `astro check` and `tsc --noEmit` exit 0 with no errors. | CI |
| F1-04 | `npm run lint` (ESLint with Astro and `jsx-a11y` rules) and `npm run format:check` (Prettier) exit 0. | CI |
| F1-05 | `npm test` (Vitest) runs at least one real unit test (for example, a content helper) and exits 0. A suite with zero tests fails this criterion. | CI |
| F1-06 | `README.md` documents `npm ci`, `npm run dev`, `npm run build`, `npm test`, `npm run lint` and how to start Keystatic locally. | Manual |
| F1-30 | `npm run dev` (and the Keystatic local admin) binds to `localhost`/`127.0.0.1` only. No dev or preview script passes `--host`, `0.0.0.0` or `server.host: true`. | CI (script/config check) |

## Content and Keystatic
| ID | Criterion | Check |
| --- | --- | --- |
| F1-07 | Keystatic is configured with `storage: { kind: 'local' }`. No GitHub-mode config, GitHub App client ID or session secret appears anywhere in the repo. | CI (grep) + Manual |
| F1-08 | Keystatic collections exist for Story, Topic, Person, Tool, NewsletterCTA, Source and SourceItem, with the fields and enums in `CONTENT_MODEL.md`. | Manual (field-by-field diff in the PR) |
| F1-09 | Matching Astro content-collection schemas reject an entry that is missing a required field or uses an invalid `status`; a failing fixture proves it. | CI (unit) |
| F1-10 | The production build contains no `keystatic` route or asset: `dist/` has no path containing `keystatic`, and no built HTML or JS references `/keystatic` or `/api/keystatic`. | Build |
| F1-11 | No `.mdx` file exists under `content/`; a CI step fails if one is added. Story bodies use Markdoc. | CI |
| F1-12 | The Markdoc config allows only the tags listed in it. A fixture with an unknown tag, and one with raw HTML, both fail the content check. | CI (unit) |
| F1-13 | Only entries with `status: published` are built. A fixture entry with `status: draft` produces no page in `dist/` and is absent from any listing. | Build |

## Security baseline (rendering)
| ID | Criterion | Check |
| --- | --- | --- |
| F1-14 | Every built page includes a `<meta http-equiv="Content-Security-Policy">` whose policy contains at least `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`, with no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`. | Build |
| F1-15 | Built HTML contains no inline `<script>` blocks other than JSON-LD (`type="application/ld+json"`), and no inline event-handler attributes (`onclick=` and similar). | Build |
| F1-31 | All JSON-LD is produced by a single helper that serialises with `JSON.stringify` and then escapes `<`, `>` and `&` as `\u003c`, `\u003e` and `\u0026`. A unit-test fixture whose title contains `</script><script>alert(1)</script>` renders as inert text inside one `application/ld+json` block, with no extra `<script>` element in the output. | Unit + Build |
| F1-16 | The F1 PR does not claim response headers on the preview. `README.md` points to ADR-0001's accepted preview-only limitation (no HSTS, `frame-ancestors` or `X-Content-Type-Options` on GitHub Pages), and no `_headers` file is presented as active on Pages. | Manual |
| F1-17 | The repo contains no secrets: `.env.example` holds placeholder values only, and secret scanning reports nothing. | CI |

## CI workflow
| ID | Criterion | Check |
| --- | --- | --- |
| F1-18 | `.github/workflows/ci.yml` runs on `pull_request` and on `push` to `main`, and runs install, format check, lint, type check, unit tests, build, the no-`.mdx` check, the no-`keystatic` `dist/` check, dependency review and CodeQL as separately named steps or jobs (L2). | Manual + CI run |
| F1-19 | `ci.yml` sets top-level `permissions: contents: read`, and no job raises it. | Manual (file review) |
| F1-32 | No workflow uses the `pull_request_target` trigger, and `ci.yml` references no `secrets.*` (the default `GITHUB_TOKEN` only). A CI grep step fails the build if either appears under `.github/workflows/`. | CI (grep step) |
| F1-20 | Every third-party `uses:` reference is pinned to a full 40-character commit SHA, with the version in a trailing comment. | CI (pin check) + Manual |
| F1-21 | CI passes on the F1 PR's head commit, and the run link is posted on the PR. | CI |

## Design tokens
| ID | Criterion | Check |
| --- | --- | --- |
| F1-22 | Tokens are defined once (CSS custom properties or a tokens file): navy `#0B132B`, slate `#1C2541`, gold `#C5A059`, gold-on-light `#7E6026`, alabaster `#F8FAFC`, white `#FFFFFF`, plus text and border colours. | Manual |
| F1-23 | Typography tokens define an editorial serif for headings, a readable sans-serif for body text, and a monospaced numeral style (`font-variant-numeric: tabular-nums` or a mono font) for metrics. Fonts are self-hosted, so the CSP needs no third-party font origin. | Manual + Build |
| F1-24 | Gold `#C5A059` is used **only on navy or slate** (7.48:1 and 6.15:1). Gold text on white or alabaster uses the `#7E6026` token, which must measure 5.85:1 on white and 5.59:1 on alabaster. No `#C5A059` text or meaningful icon appears on a light surface. | Manual (contrast table in the PR) + CI (axe colour-contrast) |
| F1-25 | Every text/background token pair used by the shell meets 4.5:1 for body text and 3:1 for large text, UI components and the focus indicator. The PR includes a measured contrast table. | Manual |
| F1-26 | The page shell passes axe with zero serious or critical violations at 360, 768 and 1280 px, and has `lang="en-GB"`, a skip link, one `h1` and `header`/`main`/`footer` landmarks. | CI (Playwright + axe) |

## Preview and content safety
| ID | Criterion | Check |
| --- | --- | --- |
| F1-27 | While the site is a preview (no production domain, D1), every built page includes `<meta name="robots" content="noindex, nofollow">` and `robots.txt` disallows all crawling. Both are controlled by one build-time setting, documented in `README.md`. | Build |
| F1-28 | The base layout includes a slot for the site-wide "Educational information, not financial advice" notice. In F1 it renders placeholder text marked for editorial sign-off on every page; the final notice is built in F10. | Build |
| F1-29 | The Story schema includes `demo: boolean` (from `CONTENT_MODEL.md`). Any sample content in F1 sets `demo: true` and uses placeholder people only. No real names, emails, phone numbers, credentials, testimonials or prices appear in the repo. The visible banner and per-page `noindex` are built in F10. | Manual + CI (schema) |

## Out of scope for F1
Components (F2), real pages (F3), the explorer (F4), feed intake (F5/L4), newsletter (F6), SEO metadata beyond the preview `noindex` (F7), "What changed" (F8), Pagefind search (F9), the final not-advice notice, demo banner and overdue-review warning (F10), and response-header assertions (deferred to the D5 host).
