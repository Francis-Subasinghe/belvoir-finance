import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  newsletterCtaSchema,
  personSchema,
  sourceItemSchema,
  sourceSchema,
  storySchema,
  toolSchema,
  topicSchema,
} from "./content/schemas";

// Content lives in the repo-root content/ folder, which Keystatic (local
// mode) writes to. Stories are Markdoc (.mdoc) only; there is no MDX.
const dataGlob = (dir: string, ext = "yaml") => glob({ pattern: `*.${ext}`, base: `./content/${dir}` });

export const collections = {
  stories: defineCollection({
    loader: glob({ pattern: "*.mdoc", base: "./content/stories" }),
    schema: storySchema,
  }),
  topics: defineCollection({ loader: dataGlob("topics"), schema: topicSchema }),
  people: defineCollection({ loader: dataGlob("people"), schema: personSchema }),
  tools: defineCollection({ loader: dataGlob("tools"), schema: toolSchema }),
  newsletterCtas: defineCollection({ loader: dataGlob("newsletter-ctas"), schema: newsletterCtaSchema }),
  sources: defineCollection({ loader: dataGlob("sources"), schema: sourceSchema }),
  // ADR-0001 req. 6: intake items are JSON written by a real serialiser.
  sourceItems: defineCollection({ loader: dataGlob("source-items", "json"), schema: sourceItemSchema }),
};
