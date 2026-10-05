/**
 * Content-collection schemas, from docs/planning/CONTENT_MODEL.md.
 * Kept free of `astro:content` so they can be unit-tested directly
 * (tests/unit/schemas.test.ts). src/content.config.ts wires them to loaders,
 * and keystatic.config.ts mirrors the same fields and enums (F3-27).
 *
 * These are the PER-ENTRY rules. Rules that need more than one entry
 * (references, demo propagation, ids) live in src/lib/content-rules.ts. Both
 * run in the build and in `npm run check:content` (F3-31).
 *
 * References to other entries are stored as entry ids (slugs). Every object is
 * strict, so an unknown key fails, and in particular a `slug:` key (Astro would
 * use it as the entry id, F3-26) is rejected.
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
/** F3-44: the four PRD content pillars, in PRD order (Atlas, Q-2). */
export const PILLARS = [
  "understand-the-numbers",
  "make-better-decisions",
  "finance-in-context",
  "build-capability",
] as const;
export const PILLAR_LABELS: Record<(typeof PILLARS)[number], string> = {
  "understand-the-numbers": "Understand the numbers",
  "make-better-decisions": "Make better decisions",
  "finance-in-context": "Finance in context",
  "build-capability": "Build capability",
};
export const SOURCE_CATEGORIES = ["primary-official", "professional-research", "practitioner"] as const;
export const FEED_TYPES = ["rss", "atom", "api", "page", "newsletter", "none"] as const;
export const RIGHTS = ["titles-only", "titles-and-short-excerpt", "licensed", "none", "unknown"] as const;
export const SOURCE_ROLES = ["primary", "expert-interpretation", "commentary"] as const;
export const SOURCE_STATUSES = ["active", "paused", "retired"] as const;
/** F3-11 (Atlas, C-4): the only Source status that counts as verified for the public library. */
export const VERIFIED_SOURCE_STATUS = "active" satisfies (typeof SOURCE_STATUSES)[number];
export const SOURCE_ITEM_STATUSES = ["queued", "dismissed", "used"] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG_PATTERN, "must be a lowercase slug (a-z, 0-9 and single hyphens)");

/** Blank strings and null (an empty Keystatic picker) mean "not set". */
const blankToUndefined = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v);
const optionalRef = z.preprocess(blankToUndefined, slug.optional());
const optionalText = z.preprocess(blankToUndefined, z.string().optional());

export const httpsUrl = z.string().refine((v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}, "must be an https URL");

/**
 * F3-23: a real calendar date written YYYY-MM-DD. The content check reads YAML
 * without timestamp resolution, so it sees the original string and rejects
 * 2026-02-30, 02/10/2026, datetimes with an offset and "". Astro's own YAML
 * loader turns a plain date into a Date at UTC midnight, which is accepted;
 * any other Date (a datetime) is rejected. The value is always a UTC-midnight
 * Date, so rendering never depends on the build machine's time zone (F3-25).
 */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseCalendarDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().endsWith("T00:00:00.000Z") ? value : null;
  }
  if (typeof value !== "string") return null;
  const m = ISO_DAY.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value ? d : null;
}
export const calendarDate = z.unknown().transform((v, ctx) => {
  const d = parseCalendarDate(v);
  if (!d) {
    ctx.addIssue({
      code: "custom",
      message: `must be a real calendar date written YYYY-MM-DD (got ${JSON.stringify(v instanceof Date ? v.toISOString() : v)})`,
    });
    return z.NEVER;
  }
  return d;
});
// null (an empty Keystatic date) means "not set"; an empty string is a bad date (F3-23).
const optionalDate = z.preprocess((v) => (v === null ? undefined : v), calendarDate.optional());

/** Required boolean with no default (F3-17, F3-18, F3-20): a missing value fails with a clear message. */
const requiredBool = (name: string) =>
  z.boolean({
    error: (iss) => (iss.input === undefined ? `${name} is required (true or false), with no default` : undefined),
  });

/** F3-22 / F3-45: jurisdictionNote is required for `other` and rejected for any other value. */
function jurisdictionRule(
  s: { jurisdiction: string; jurisdictionNote?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (s.jurisdiction === "other" && !s.jurisdictionNote) {
    ctx.addIssue({
      code: "custom",
      path: ["jurisdictionNote"],
      message: 'a jurisdiction of "other" needs a non-blank jurisdictionNote',
    });
  }
  if (s.jurisdiction !== "other" && s.jurisdictionNote !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["jurisdictionNote"],
      message: 'jurisdictionNote is only allowed when jurisdiction is "other"',
    });
  }
}

const jurisdiction = z.enum(JURISDICTIONS, {
  error: (iss) => `must be one of ${JURISDICTIONS.join(", ")} (got ${JSON.stringify(iss.input)})`,
});

export const storySchema = z
  .strictObject({
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(300),
    format: z.enum(FORMATS),
    pillars: z
      .array(
        z.enum(PILLARS, {
          error: (iss) => `unknown pillar ${JSON.stringify(iss.input)}; use one of ${PILLARS.join(", ")}`,
        }),
      )
      .default([]),
    topics: z.array(slug).default([]),
    reader: z.string().min(1),
    level: z.enum(LEVELS),
    author: slug,
    reviewer: optionalRef,
    firstPublished: optionalDate,
    lastReviewed: optionalDate,
    nextReviewDue: optionalDate,
    timeSensitive: z.boolean().default(false),
    jurisdiction: jurisdiction.default("UK"),
    jurisdictionNote: optionalText,
    period: optionalText,
    sources: z.array(z.strictObject({ source: slug, url: httpsUrl, accessed: calendarDate })).default([]),
    relatedStories: z.array(slug).default([]),
    relatedTools: z.array(slug).default([]),
    disclosure: optionalText,
    factual: requiredBool("factual"),
    commercialInterest: requiredBool("commercialInterest"),
    demo: requiredBool("demo"),
    status: z.enum(STATUSES),
  })
  .superRefine((s, ctx) => {
    const published = s.status === "published";
    if (s.timeSensitive && !s.nextReviewDue) {
      ctx.addIssue({ code: "custom", path: ["nextReviewDue"], message: "required for time-sensitive stories" });
    }
    if (published && !s.firstPublished) {
      ctx.addIssue({ code: "custom", path: ["firstPublished"], message: "required once published" });
    }
    if (published && !s.lastReviewed) {
      ctx.addIssue({ code: "custom", path: ["lastReviewed"], message: "required once published" });
    }
    if (s.firstPublished && s.lastReviewed && s.lastReviewed < s.firstPublished) {
      ctx.addIssue({ code: "custom", path: ["lastReviewed"], message: "must be on or after firstPublished" });
    }
    if (s.lastReviewed && s.nextReviewDue && s.nextReviewDue <= s.lastReviewed) {
      ctx.addIssue({ code: "custom", path: ["nextReviewDue"], message: "must be after lastReviewed" });
    }
    // A past nextReviewDue never fails the build: that's the F10 warning only.
    if (published && s.factual && !s.reviewer) {
      ctx.addIssue({ code: "custom", path: ["reviewer"], message: "a published factual story needs a reviewer" });
    }
    if (s.reviewer && s.reviewer === s.author) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewer"],
        message: `the reviewer must be someone other than the author (both are "${s.author}")`,
      });
    }
    if (s.commercialInterest && !s.disclosure) {
      ctx.addIssue({
        code: "custom",
        path: ["disclosure"],
        message: "a story with a commercial interest needs a non-blank disclosure",
      });
    }
    jurisdictionRule(s, ctx);
    if (s.demo) {
      s.sources.forEach((src, i) => {
        if (!isPlaceholderUrl(src.url)) {
          ctx.addIssue({
            code: "custom",
            path: ["sources", i, "url"],
            message: `a demo story may only cite placeholder URLs on example.org, example.com, example.net or a .invalid host, over https (got ${src.url})`,
          });
        }
      });
    }
  });

export const topicSchema = z.strictObject({
  title: z.string().min(1),
  summary: z.string().min(1),
  pillar: z.enum(PILLARS, {
    error: (iss) => `unknown pillar ${JSON.stringify(iss.input)}; use one of ${PILLARS.join(", ")}`,
  }),
  readingPath: z.array(slug).default([]),
  featuredTool: optionalRef,
  demo: requiredBool("demo"),
});

/**
 * F3-50 (Atlas C-8, Aegis): protected titles, designations and memberships
 * that must never appear in Person text (credential labels, role, bio).
 * Committed content uses obviously made-up placeholder wording instead.
 * A false positive is fixed by rewording, never by an exception list.
 */
export const PROTECTED_CREDENTIAL_TERMS = [
  "Chartered Accountant",
  "Chartered",
  "ACA",
  "FCA",
  "ACCA",
  "FCCA",
  "CIMA",
  "ACMA",
  "FCMA",
  "CGMA",
  "CTA",
  "Chartered Tax Adviser",
  "ATT",
  "CIOT",
  "ICAEW",
  "ICAS",
  "CPA",
  "CFA",
  "CFP",
  "IFA",
  "Independent Financial Adviser",
  "FCA authorised",
  "FCA regulated",
  "Authorised by",
  "Regulated by",
  "Member of",
] as const;

/**
 * Lower-case, split on any run of non-letters/digits, then join runs of
 * single-letter tokens ("a.c.c.a" -> "acca"), so matching ignores case,
 * punctuation and spacing but respects word boundaries.
 */
export function protectedTermTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const out: string[] = [];
  let run = "";
  for (const t of raw) {
    if (t.length === 1) {
      run += t;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

/** The first protected term in `text`, or undefined (whole tokens, multi-word terms in sequence). */
export function findProtectedTerm(text: string): string | undefined {
  const tokens = protectedTermTokens(text);
  for (const term of PROTECTED_CREDENTIAL_TERMS) {
    const want = protectedTermTokens(term);
    for (let i = 0; i + want.length <= tokens.length; i++) {
      if (want.every((w, j) => tokens[i + j] === w)) return term;
    }
  }
  return undefined;
}

function protectedTermRule(text: string, path: (string | number)[], ctx: z.RefinementCtx): void {
  const term = findProtectedTerm(text);
  if (term) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `contains the protected title or membership "${term}"; use obvious placeholder wording`,
    });
  }
}

export const credentialSchema = z
  .strictObject({
    label: z.string().min(1),
    verified: z.boolean().default(false),
    verifiedBy: optionalText,
    verifiedOn: optionalDate,
  })
  .superRefine((c, ctx) => {
    if (c.verified && !c.verifiedBy) {
      ctx.addIssue({ code: "custom", path: ["verifiedBy"], message: "a verified credential needs verifiedBy" });
    }
    if (c.verified && !c.verifiedOn) {
      ctx.addIssue({ code: "custom", path: ["verifiedOn"], message: "a verified credential needs verifiedOn" });
    }
    protectedTermRule(c.label, ["label"], ctx);
  });

export const personSchema = z
  .strictObject({
    displayName: z.string().min(1),
    role: z.string().min(1),
    bio: z.string().default(""),
    demo: requiredBool("demo"),
    credentials: z.array(credentialSchema).default([]),
  })
  .superRefine((p, ctx) => {
    protectedTermRule(p.role, ["role"], ctx);
    protectedTermRule(p.bio, ["bio"], ctx);
  });

export const toolSchema = z.strictObject({
  title: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.strictObject({ label: z.string(), default: z.string(), explanation: z.string() })).default([]),
  limitations: z.string().default(""),
  reviewer: optionalRef,
  sourceRecord: optionalRef,
  usesOfficialValues: z.boolean().default(false),
  demo: requiredBool("demo"),
});

export const newsletterCtaSchema = z.strictObject({
  heading: z.string().min(1),
  valueProp: z.string().min(1),
  cadence: z.string().min(1),
  placement: z.string().min(1),
});

/**
 * F3-48 (Atlas C-4, Aegis): placeholder URLs use a reserved domain. The host is
 * taken from the PARSED URL, so lookalikes (example.org.evil.test), prefix
 * tricks (notexample.org) and userinfo tricks ("example.org" written before an "@")
 * fail; any URL with a username or password, or a scheme other than https:, fails outright.
 */
export const PLACEHOLDER_DOMAINS = ["example.org", "example.com", "example.net"] as const;
export function isPlaceholderUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Aegis (Low): only https, so javascript:, data:, http: and other schemes fail even on a placeholder host.
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  return PLACEHOLDER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) || host.endsWith(".invalid");
}

export const sourceSchema = z
  .strictObject({
    name: z.string().min(1),
    publisher: z.string().min(1),
    category: z.enum(SOURCE_CATEGORIES),
    topics: z.array(z.string()).default([]),
    jurisdiction: jurisdiction.default("UK"),
    jurisdictionNote: optionalText,
    website: httpsUrl,
    feedUrl: z.preprocess(blankToUndefined, httpsUrl.optional()),
    feedType: z.enum(FEED_TYPES),
    updateFrequency: z.string().min(1),
    rights: z.enum(RIGHTS),
    rightsNotes: z.string().default(""),
    role: z.enum(SOURCE_ROLES),
    owner: slug,
    lastChecked: calendarDate,
    editorialNotes: z.string().default(""),
    demo: requiredBool("demo"),
    status: z.enum(SOURCE_STATUSES),
  })
  .superRefine((s, ctx) => {
    jurisdictionRule(s, ctx);
    if (s.demo) {
      for (const key of ["website", "feedUrl"] as const) {
        const url = s[key];
        if (url !== undefined && !isPlaceholderUrl(url)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `a placeholder (demo) source may only link to example.org, example.com, example.net or a .invalid host, over https (got ${url})`,
          });
        }
      }
      if (!/\(placeholder\)/i.test(s.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: 'a placeholder (demo) source must say "(placeholder)" in its name',
        });
      }
    }
  });

export const sourceItemSchema = z.strictObject({
  sourceId: slug,
  title: z.string().min(1).max(300),
  url: httpsUrl,
  // Full datetimes, left to F5 (CF-07).
  publishedAt: z.coerce.date(),
  fetchedAt: z.coerce.date(),
  excerpt: z.string().max(500).optional(),
  status: z.enum(SOURCE_ITEM_STATUSES),
  usedInStory: slug.optional(),
});

export type Story = z.infer<typeof storySchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Person = z.infer<typeof personSchema>;
export type Tool = z.infer<typeof toolSchema>;
export type Source = z.infer<typeof sourceSchema>;

/** The collections, their content folders and file types (shared by content.config.ts and the content check). */
export const COLLECTIONS = {
  stories: { dir: "stories", ext: ".mdoc", schema: storySchema, label: "Story" },
  topics: { dir: "topics", ext: ".yaml", schema: topicSchema, label: "Topic" },
  people: { dir: "people", ext: ".yaml", schema: personSchema, label: "Person" },
  tools: { dir: "tools", ext: ".yaml", schema: toolSchema, label: "Tool" },
  newsletterCtas: { dir: "newsletter-ctas", ext: ".yaml", schema: newsletterCtaSchema, label: "NewsletterCTA" },
  sources: { dir: "sources", ext: ".yaml", schema: sourceSchema, label: "Source" },
  sourceItems: { dir: "source-items", ext: ".json", schema: sourceItemSchema, label: "SourceItem" },
} as const;
export type CollectionName = keyof typeof COLLECTIONS;
