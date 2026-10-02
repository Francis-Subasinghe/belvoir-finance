/**
 * Content-collection schemas, from docs/planning/CONTENT_MODEL.md.
 * Kept free of `astro:content` so they can be unit-tested directly
 * (tests/unit/schemas.test.ts). src/content.config.ts wires them to loaders,
 * and keystatic.config.ts mirrors the same fields and enums.
 *
 * References to other entries are stored as entry ids (slugs).
 */
import { z } from "astro/zod";

export const STATUSES = ["draft", "review", "approved", "published", "retired"] as const;
export const FORMATS = [
  "explainer",
  "visual-story",
  "what-changed",
  "interactive-lesson",
  "reading-path",
  "source-note",
  "newsletter",
] as const;
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const JURISDICTIONS = ["UK", "IE", "EU", "US", "other"] as const;
export const SOURCE_CATEGORIES = ["primary-official", "professional-research", "practitioner"] as const;
export const FEED_TYPES = ["rss", "atom", "api", "page", "newsletter", "none"] as const;
export const RIGHTS = ["titles-only", "titles-and-short-excerpt", "licensed", "none", "unknown"] as const;
export const SOURCE_ROLES = ["primary", "expert-interpretation", "commentary"] as const;
export const SOURCE_STATUSES = ["active", "paused", "retired"] as const;
export const SOURCE_ITEM_STATUSES = ["queued", "dismissed", "used"] as const;

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug");
export const httpsUrl = z.string().refine((v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}, "must be an https URL");
const date = z.coerce.date();

export const storySchema = z
  .object({
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(300),
    format: z.enum(FORMATS),
    pillars: z.array(slug).default([]),
    topics: z.array(slug).default([]),
    reader: z.string().min(1),
    level: z.enum(LEVELS),
    author: slug,
    reviewer: slug.optional(),
    firstPublished: date.optional(),
    lastReviewed: date.optional(),
    nextReviewDue: date.optional(),
    timeSensitive: z.boolean().default(false),
    jurisdiction: z.enum(JURISDICTIONS).default("UK"),
    period: z.string().optional(),
    sources: z.array(z.object({ source: slug, url: httpsUrl, accessed: date })).default([]),
    relatedStories: z.array(slug).default([]),
    relatedTools: z.array(slug).default([]),
    disclosure: z.string().optional(),
    demo: z.boolean().default(false),
    status: z.enum(STATUSES),
  })
  .superRefine((s, ctx) => {
    if (s.timeSensitive && !s.nextReviewDue) {
      ctx.addIssue({ code: "custom", path: ["nextReviewDue"], message: "required for time-sensitive stories" });
    }
    if (s.status === "published" && !s.firstPublished) {
      ctx.addIssue({ code: "custom", path: ["firstPublished"], message: "required once published" });
    }
  });

export const topicSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  pillar: z.string().min(1),
  readingPath: z.array(slug).default([]),
  featuredTool: slug.optional(),
});

export const personSchema = z.object({
  displayName: z.string().min(1),
  role: z.string().min(1),
  bio: z.string().default(""),
  placeholder: z.boolean().default(false),
  credentials: z
    .array(
      z.object({
        label: z.string().min(1),
        verified: z.boolean().default(false),
        verifiedBy: z.string().optional(),
        verifiedOn: date.optional(),
      }),
    )
    .default([]),
});

export const toolSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.object({ label: z.string(), default: z.string(), explanation: z.string() })).default([]),
  limitations: z.string().default(""),
  reviewer: slug.optional(),
  sourceRecord: slug.optional(),
  usesOfficialValues: z.boolean().default(false),
});

export const newsletterCtaSchema = z.object({
  heading: z.string().min(1),
  valueProp: z.string().min(1),
  cadence: z.string().min(1),
  placement: z.string().min(1),
});

export const sourceSchema = z.object({
  name: z.string().min(1),
  publisher: z.string().min(1),
  category: z.enum(SOURCE_CATEGORIES),
  topics: z.array(z.string()).default([]),
  jurisdiction: z.string().min(1),
  website: httpsUrl,
  feedUrl: httpsUrl.optional(),
  feedType: z.enum(FEED_TYPES),
  updateFrequency: z.string().min(1),
  rights: z.enum(RIGHTS),
  rightsNotes: z.string().default(""),
  role: z.enum(SOURCE_ROLES),
  owner: slug,
  lastChecked: date,
  editorialNotes: z.string().default(""),
  status: z.enum(SOURCE_STATUSES),
});

export const sourceItemSchema = z.object({
  sourceId: slug,
  title: z.string().min(1).max(300),
  url: httpsUrl,
  publishedAt: date,
  fetchedAt: date,
  excerpt: z.string().max(500).optional(),
  status: z.enum(SOURCE_ITEM_STATUSES),
  usedInStory: slug.optional(),
});

export type Story = z.infer<typeof storySchema>;
