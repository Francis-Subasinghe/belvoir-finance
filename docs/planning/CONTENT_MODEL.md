# Content model and source-registry schema

Every entry has a stable `id` (a slug, never reused) and, where relevant, `status: draft | review | approved | published | retired`. The build includes only entries whose status is `published`.

## Story
| Field | Type | Notes |
| --- | --- | --- |
| id, title, summary | string | The summary is one sentence |
| format | enum | explainer, visual-story, what-changed, interactive-lesson, reading-path, source-note, newsletter |
| pillars, topics | ref[] → Topic | |
| reader | string | Who this story is for |
| level | enum | beginner, intermediate, advanced |
| author, reviewer | ref → Person | A reviewer is required for factual finance items |
| firstPublished, lastReviewed, nextReviewDue | date | `nextReviewDue` is required for time-sensitive stories |
| jurisdiction | enum | Defaults to UK. Any other country is labelled visibly |
| period | string? | Tax year or reporting period |
| sources | ref[] → Source + url + accessed date | |
| body | rich text | Uses fact, estimate, example and opinion callout blocks |
| relatedStories, relatedTools | ref[] | |
| disclosure | string? | Required if any commercial interest exists |
| status | enum | |

## Topic
`id, title, summary, pillar, readingPath: ref[] → Story (ordered), featuredTool?`

## Person (author or reviewer)
`id, displayName, role, bio, credentials (verified: boolean, verifiedBy, verifiedOn)`. Credentials appear on the site only when `verified` is true. The repo holds no personal contact details.

## Tool
`id, title, summary, assumptions[] (label, default, explanation), limitations, reviewer?, sourceRecord?` A reviewer and source record are required if the tool uses current tax, legal or official values.

## NewsletterCTA
`id, heading, valueProp, cadence, placement`

## Source (registry)
| Field | Type |
| --- | --- |
| id, name, publisher | string |
| category | enum: primary-official, professional-research, practitioner |
| topics | string[] |
| jurisdiction | string |
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
| status | enum: active, paused, retired |

## SourceItem (intake queue)
`id, sourceId, title (plain text, capped at 300 chars), url (https only, never fetched), publishedAt, fetchedAt, excerpt (plain text, capped at 500 chars, and only if rights allow), status: queued | dismissed | used, usedInStory?`

SourceItems are never shown publicly unless a published Story references them together with Belvoir's explanation.
