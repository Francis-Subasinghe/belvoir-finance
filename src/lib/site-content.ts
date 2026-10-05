/**
 * Page-side access to content. Everything a page renders comes through here,
 * so the publication filter (F3-14) and reference lookups (F3-15) live in one
 * place. References are checked before rendering by the content rules
 * (src/lib/content-rules.ts), so a lookup that misses is a bug and throws
 * instead of falling back to the raw id.
 */
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { VERIFIED_SOURCE_STATUS } from "../content/schemas";
import { newestFirst, onlyPublished } from "./stories";
import { withBase } from "./paths";

export type StoryEntry = CollectionEntry<"stories">;
export type PersonEntry = CollectionEntry<"people">;
export type TopicEntry = CollectionEntry<"topics">;
export type ToolEntry = CollectionEntry<"tools">;
export type SourceEntry = CollectionEntry<"sources">;

/** Every published story, newest first (ties by id). */
export async function publishedStories(): Promise<StoryEntry[]> {
  return newestFirst(onlyPublished(await getCollection("stories")));
}

export async function topics(): Promise<TopicEntry[]> {
  return (await getCollection("topics")).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function tools(): Promise<ToolEntry[]> {
  return (await getCollection("tools")).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** F3-11 (C-4): only `active` sources are public. */
export async function verifiedSources(): Promise<SourceEntry[]> {
  return (await getCollection("sources"))
    .filter((s) => s.data.status === VERIFIED_SOURCE_STATUS)
    .sort((a, b) => (a.data.name < b.data.name ? -1 : a.data.name > b.data.name ? 1 : 0));
}

async function must<C extends "people" | "topics" | "tools" | "sources">(collection: C, id: string) {
  const entry = await getEntry(collection, id);
  if (!entry) throw new Error(`${collection}: no entry "${id}" (the content rules should have failed the build)`);
  return entry;
}
export const person = (id: string) => must("people", id);
export const topic = (id: string) => must("topics", id);
export const tool = (id: string) => must("tools", id);
export const source = (id: string) => must("sources", id);

/** F3-43: people credited as author or reviewer on a published story. */
export async function creditedPeople(): Promise<PersonEntry[]> {
  const ids = new Set<string>();
  for (const s of await publishedStories()) {
    ids.add(s.data.author);
    if (s.data.reviewer) ids.add(s.data.reviewer);
  }
  return Promise.all([...ids].sort().map((id) => person(id)));
}

export const storyHref = (id: string) => withBase(`/stories/${id}/`);
export const topicHref = (id: string) => withBase(`/topics/${id}/`);
export const toolHref = (id: string) => withBase(`/tools/${id}/`);
export const personHref = (id: string) => withBase(`/people/${id}/`);

/** Only verified credentials ever leave this function (F3-19). */
export function verifiedCredentials(p: PersonEntry): string[] {
  return p.data.credentials.filter((c) => c.verified).map((c) => c.label);
}

/** Byline data for ArticleHeader (F3-09). */
export function byline(p: PersonEntry) {
  return { name: p.data.displayName, href: personHref(p.id), demo: p.data.demo, credentials: verifiedCredentials(p) };
}

/** StoryCard props for a story (format, level, date, demo and the non-UK label, F3-07 / F3-22). */
export function cardProps(s: StoryEntry) {
  return {
    title: s.data.title,
    href: storyHref(s.id),
    summary: s.data.summary,
    format: s.data.format,
    level: s.data.level,
    date: s.data.firstPublished,
    demo: s.data.demo,
    jurisdiction: s.data.jurisdiction,
    jurisdictionNote: s.data.jurisdictionNote,
  };
}
