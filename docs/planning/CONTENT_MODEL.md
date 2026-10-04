# Content model and source-registry schema

Every entry has a stable `id` (a slug, never reused) and, where relevant, `status: draft | review | approved | published | retired`. The build includes only entries whose status is `published`.

**Enforcement (F3).** `src/content/schemas.ts` is the Zod source of truth and `checkContentRules()` (`src/lib/content-rules.ts`) applies it to `content/` in `astro build` and `npm run check:content`. Unknown keys fail (strict objects). The id is the file name without its extension and must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; a `slug` key, a non-slug file name and two files whose ids differ only by case all fail the build (F3-26). Retired ids are never reused. Calendar dates are written `YYYY-MM-DD` and must be real dates (F3-23); no rule compares a date with the clock (F3-24, F3-51). A required boolean "with no default" must be written in the file, `true` or `false`; Keystatic always writes it.

## Story
| Field | Type | Notes |
| --- | --- | --- |
| id, title, summary | string | The summary is one sentence |
| format | enum | explainer, visual-story, what-changed, interactive-lesson, reading-path, source-note, newsletter |
| pillars | enum[] | Fixed list `PILLARS`: understand-the-numbers, make-better-decisions, finance-in-context, build-capability (F3-44). Not a reference |
| topics | ref[] → Topic | The only link from a Story to Topic entries (F3-15) |
| reader | string | Who this story is for |
| level | enum | beginner, intermediate, advanced |
| author | ref → Person | Required |
| reviewer | ref? → Person | Required when `published` and `factual: true` (F3-17); never the same as `author` (F3-46) |
| factual | boolean, required, no default | Set by the editor, not derived from `format` (F3-17) |
| commercialInterest | boolean, required, no default | `true` requires a non-blank `disclosure` (F3-18) |
| firstPublished, lastReviewed, nextReviewDue | date (`YYYY-MM-DD`) | Once `published`: `firstPublished` and `lastReviewed` required, `lastReviewed` ≥ `firstPublished`; `nextReviewDue` > `lastReviewed` when set; `nextReviewDue` required when `timeSensitive` (F3-24) |
| timeSensitive | boolean | Defaults to false |
| jurisdiction | enum: UK, IE, EU, US, other | Defaults to UK. Any other value is labelled visibly on the story page and every card (F3-22) |
| jurisdictionNote | string? | Required and non-blank when `jurisdiction` is `other`; rejected otherwise (F3-22, F3-45) |
| period | string? | Tax year or reporting period |
| sources | (ref → Source + https url + accessed date)[] | A demo Story cites only demo Sources and placeholder URLs; a non-demo Story can't cite a demo Source (F3-34, F3-48) |
| body | rich text | Uses fact, estimate, example and opinion callout blocks |
| relatedStories | ref[] → Story | A target that isn't published is a warning and is left out (F3-16) |
| relatedTools | ref[] → Tool | |
| disclosure | string? | Required if any commercial interest exists |
| demo | boolean, required, no default | `true` shows a demo banner and sets `noindex` (F3-20). A Story whose author or reviewer is a demo Person must be demo (F3-21) |
| status | enum | |

## Topic
`id, title, summary, pillar (enum PILLARS), readingPath: ref[] → Story (ordered; unpublished targets warn and are left out), featuredTool?: ref → Tool, demo (boolean, required, no default)`

## Person (author or reviewer)
`id, displayName, role, bio, demo (boolean, required, no default), credentials[] (label, verified: boolean default false, verifiedBy, verifiedOn)`. A verified credential needs `verifiedBy` and `verifiedOn`; credentials appear on the site (Person page and story byline) only when `verified` is true (F3-19). The `placeholder` field is removed: `demo` alone marks a placeholder person (C-5), and a leftover `placeholder` key fails. Credential labels, `role` and `bio` may not contain a protected title or membership from `PROTECTED_CREDENTIAL_TERMS` (whole-word, ignoring case and punctuation, F3-50). While D8 is open every committed Person is `demo: true`, has a `displayName` starting "Placeholder" and no `verified: true` credential. `/people/<id>/` exists for each Person credited on a published Story (F3-43). The repo holds no personal contact details.

## Tool
`id, title, summary, assumptions[] (label, default, explanation), limitations, reviewer?, sourceRecord?, usesOfficialValues, demo (boolean, required, no default)` A reviewer and source record are required if the tool uses current tax, legal or official values.

## NewsletterCTA
`id, heading, valueProp, cadence, placement`

## Source (registry)
| Field | Type |
| --- | --- |
| id, name, publisher | string |
| category | enum: primary-official, professional-research, practitioner |
| topics | string[] |
| jurisdiction | enum: UK, IE, EU, US, other (defaults to UK) |
| jurisdictionNote | string? (required for `other`, rejected otherwise; F3-45) |
| website | https URL |
| feedUrl | https URL? (the only URLs the intake job may fetch) |
| feedType | enum: rss, atom, api, page, newsletter, none |
| updateFrequency | string |
| rights | enum: titles-only, titles-and-short-excerpt, licensed, none, unknown (`unknown` means titles only) |
| rightsNotes | string |
| role | enum: primary, expert-interpretation, commentary |
| owner | ref → Person |
| lastChecked | date |
| editorialNotes | string |
| demo | boolean, required, no default. A demo Source has "(placeholder)" in its name and its `website` and `feedUrl` on example.org, example.com, example.net (or a subdomain) or a `.invalid` host, judged on the parsed host, with no username or password (F3-48) |
| status | enum: active, paused, retired. "Verified" means `active`; only active Sources are listed on `/sources/`, from a fixed field allowlist (name, publisher, category, role, jurisdiction, website). `feedUrl`, `rightsNotes`, `owner` and `editorialNotes` never render (F3-11) |

## SourceItem (intake queue)
`id, sourceId, title (plain text, capped at 300 chars), url (https only, never fetched), publishedAt, fetchedAt, excerpt (plain text, capped at 500 chars, and only if rights allow), status: queued | dismissed | used, usedInStory?`

SourceItems are never shown publicly unless a published Story references them together with Belvoir's explanation.

## Feed intake failure modes
- **Feed dead, timing out or returning a non-200:** record `lastError` and `lastErrorAt` on the source, then skip it. After three consecutive failures, open an issue for the source owner.
- **Malformed XML:** reject the whole fetch and record the error. Never partially import.
- **Duplicates:** dedupe on normalised `url`, falling back to `sourceId` + `title` + `publishedAt`.
- **Paused or retired source:** never fetched.
- **Rights `unknown`:** store the title and link only, with no excerpt.
