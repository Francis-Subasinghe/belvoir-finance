/**
 * The single allowlist of Markdoc tags that content may use (ADR-0001, 0b).
 * Both the site renderer (markdoc.config.ts) and the content check
 * (src/lib/content-check.ts) are built from this object, so they can never
 * drift apart. Anything not listed here fails the content check.
 */
export const CALLOUT_TYPES = ["fact", "estimate", "example", "opinion"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const allowedTags = {
  callout: {
    attributes: {
      type: { type: String, required: true, matches: [...CALLOUT_TYPES] as string[] },
      title: { type: String, required: false },
    },
  },
};

export const allowedTagNames = Object.keys(allowedTags);
