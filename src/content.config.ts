import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { COLLECTIONS } from "./content/schemas";

// Content lives in the repo-root content/ folder, which Keystatic (local
// mode) writes to. Stories are Markdoc (.mdoc) only; there is no MDX.
// ADR-0001 req. 6: intake items are JSON written by a real serialiser.
// Ids come from file names only (F3-26): the schemas are strict, so a `slug:`
// key fails, and the content rules (astro.config.mjs) fail the build on a
// duplicate or non-slug id before Astro's loader would just warn.
const base = (name: keyof typeof COLLECTIONS) => {
  const c = COLLECTIONS[name];
  return glob({ pattern: `*${c.ext}`, base: `./content/${c.dir}` });
};

export const collections = {
  stories: defineCollection({ loader: base("stories"), schema: COLLECTIONS.stories.schema }),
  topics: defineCollection({ loader: base("topics"), schema: COLLECTIONS.topics.schema }),
  people: defineCollection({ loader: base("people"), schema: COLLECTIONS.people.schema }),
  tools: defineCollection({ loader: base("tools"), schema: COLLECTIONS.tools.schema }),
  newsletterCtas: defineCollection({ loader: base("newsletterCtas"), schema: COLLECTIONS.newsletterCtas.schema }),
  sources: defineCollection({ loader: base("sources"), schema: COLLECTIONS.sources.schema }),
  sourceItems: defineCollection({ loader: base("sourceItems"), schema: COLLECTIONS.sourceItems.schema }),
};
