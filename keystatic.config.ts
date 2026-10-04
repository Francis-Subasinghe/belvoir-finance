/**
 * Keystatic, LOCAL MODE ONLY (ADR-0001, security requirement 0; F1-07).
 * Edits are written straight to content/ on your own machine and reach the
 * site through a normal branch + PR. There is no GitHub-mode storage, GitHub
 * App or session secret, and the admin UI is never part of a production
 * build (see astro.config.mjs).
 *
 * Fields and enums mirror docs/planning/CONTENT_MODEL.md and
 * src/content/schemas.ts. Keep all three in sync.
 */
import { collection, config, fields } from "@keystatic/core";
import { wrapper } from "@keystatic/core/content-components";
import {
  FEED_TYPES,
  FORMATS,
  JURISDICTIONS,
  LEVELS,
  RIGHTS,
  SOURCE_CATEGORIES,
  SOURCE_ITEM_STATUSES,
  SOURCE_ROLES,
  SOURCE_STATUSES,
  STATUSES,
} from "./src/content/schemas";
import { CALLOUT_TYPES } from "./src/lib/markdoc-allowlist";

const options = <T extends string>(values: readonly T[]) => values.map((v) => ({ label: v, value: v }));
const select = <T extends string>(label: string, values: readonly [T, ...T[]], defaultValue: T = values[0]) =>
  fields.select({ label, options: options(values), defaultValue });
const ids = (label: string) => fields.array(fields.text({ label }), { label, itemLabel: (p) => p.value });
const optionalDate = (label: string) => fields.date({ label });

export default config({
  storage: { kind: "local" },
  ui: { brand: { name: "Belvoir Finance (local)" } },
  collections: {
    stories: collection({
      label: "Stories",
      slugField: "title",
      path: "content/stories/*",
      format: { contentField: "body" },
      entryLayout: "content",
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        summary: fields.text({ label: "Summary (one sentence)", multiline: true }),
        format: select("Format", FORMATS),
        pillars: ids("Pillars"),
        topics: ids("Topics"),
        reader: fields.text({ label: "Reader" }),
        level: select("Level", LEVELS),
        author: fields.text({ label: "Author (person id)" }),
        reviewer: fields.text({ label: "Reviewer (person id; required for factual finance items)" }),
        firstPublished: optionalDate("First published"),
        lastReviewed: optionalDate("Last reviewed"),
        nextReviewDue: optionalDate("Next review due"),
        timeSensitive: fields.checkbox({ label: "Time-sensitive" }),
        jurisdiction: select("Jurisdiction", JURISDICTIONS, "UK"),
        period: fields.text({ label: "Tax year or period" }),
        sources: fields.array(
          fields.object({
            source: fields.text({ label: "Source id" }),
            url: fields.url({ label: "URL (https)" }),
            accessed: fields.date({ label: "Accessed" }),
          }),
          { label: "Sources", itemLabel: (p) => p.fields.source.value },
        ),
        relatedStories: ids("Related stories"),
        relatedTools: ids("Related tools"),
        disclosure: fields.text({ label: "Disclosure", multiline: true }),
        demo: fields.checkbox({ label: "Demo content (shows banner, sets noindex)", defaultValue: true }),
        status: select("Status", STATUSES),
        body: fields.markdoc({
          label: "Body",
          options: { image: false },
          components: {
            callout: wrapper({
              label: "Callout",
              schema: {
                type: fields.select({ label: "Type", options: options(CALLOUT_TYPES), defaultValue: "fact" }),
                title: fields.text({ label: "Title" }),
              },
            }),
          },
        }),
      },
    }),
    topics: collection({
      label: "Topics",
      slugField: "title",
      path: "content/topics/*",
      format: { data: "yaml" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        summary: fields.text({ label: "Summary", multiline: true }),
        pillar: fields.text({ label: "Pillar" }),
        readingPath: ids("Reading path (story ids, in order)"),
        featuredTool: fields.text({ label: "Featured tool id" }),
      },
    }),
    people: collection({
      label: "People (placeholders only until D8)",
      slugField: "displayName",
      path: "content/people/*",
      format: { data: "yaml" },
      schema: {
        displayName: fields.slug({ name: { label: "Display name" } }),
        role: fields.text({ label: "Role" }),
        bio: fields.text({ label: "Bio", multiline: true }),
        placeholder: fields.checkbox({ label: "Placeholder person", defaultValue: true }),
        credentials: fields.array(
          fields.object({
            label: fields.text({ label: "Credential" }),
            verified: fields.checkbox({ label: "Verified" }),
            verifiedBy: fields.text({ label: "Verified by" }),
            verifiedOn: fields.date({ label: "Verified on" }),
          }),
          { label: "Credentials (shown only when verified)", itemLabel: (p) => p.fields.label.value },
        ),
      },
    }),
    tools: collection({
      label: "Tools",
      slugField: "title",
      path: "content/tools/*",
      format: { data: "yaml" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        summary: fields.text({ label: "Summary", multiline: true }),
        assumptions: fields.array(
          fields.object({
            label: fields.text({ label: "Label" }),
            default: fields.text({ label: "Default" }),
            explanation: fields.text({ label: "Explanation", multiline: true }),
          }),
          { label: "Assumptions", itemLabel: (p) => p.fields.label.value },
        ),
        limitations: fields.text({ label: "Limitations", multiline: true }),
        reviewer: fields.text({ label: "Reviewer (person id)" }),
        sourceRecord: fields.text({ label: "Source record id" }),
        usesOfficialValues: fields.checkbox({ label: "Uses current tax, legal or official values" }),
      },
    }),
    newsletterCtas: collection({
      label: "Newsletter CTAs",
      slugField: "heading",
      path: "content/newsletter-ctas/*",
      format: { data: "yaml" },
      schema: {
        heading: fields.slug({ name: { label: "Heading" } }),
        valueProp: fields.text({ label: "Value proposition", multiline: true }),
        cadence: fields.text({ label: "Cadence" }),
        placement: fields.text({ label: "Placement" }),
      },
    }),
    sources: collection({
      label: "Source registry",
      slugField: "name",
      path: "content/sources/*",
      format: { data: "yaml" },
      schema: {
        name: fields.slug({ name: { label: "Name" } }),
        publisher: fields.text({ label: "Publisher" }),
        category: select("Category", SOURCE_CATEGORIES),
        topics: ids("Topics"),
        jurisdiction: fields.text({ label: "Jurisdiction", defaultValue: "UK" }),
        website: fields.url({ label: "Website (https)" }),
        feedUrl: fields.url({ label: "Feed URL (https; the only URL intake may fetch)" }),
        feedType: select("Feed type", FEED_TYPES, "none"),
        updateFrequency: fields.text({ label: "Update frequency" }),
        rights: select("Rights", RIGHTS, "unknown"),
        rightsNotes: fields.text({ label: "Rights notes", multiline: true }),
        role: select("Role", SOURCE_ROLES),
        owner: fields.text({ label: "Owner (person id)" }),
        lastChecked: fields.date({ label: "Last checked" }),
        editorialNotes: fields.text({ label: "Editorial notes", multiline: true }),
        status: select("Status", SOURCE_STATUSES, "paused"),
      },
    }),
    sourceItems: collection({
      label: "Source items (intake queue)",
      slugField: "title",
      path: "content/source-items/*",
      format: { data: "json" },
      schema: {
        title: fields.slug({ name: { label: "Title (plain text, max 300)" } }),
        sourceId: fields.text({ label: "Source id" }),
        url: fields.url({ label: "URL (https; never fetched)" }),
        publishedAt: fields.date({ label: "Published at" }),
        fetchedAt: fields.date({ label: "Fetched at" }),
        excerpt: fields.text({ label: "Excerpt (plain text, max 500; only if rights allow)", multiline: true }),
        status: select("Status", SOURCE_ITEM_STATUSES),
        usedInStory: fields.text({ label: "Used in story id" }),
      },
    }),
  },
});
