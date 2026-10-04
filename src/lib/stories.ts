/**
 * Publication filter (F1-13, F3-14): only `published` entries are ever built or
 * listed. Pages must get stories through these helpers, never getCollection
 * directly (a unit scan enforces it). Sorting is deterministic (F3-25): newest
 * `firstPublished` first, ties broken by the alphabetically first id.
 */
export interface HasStatus {
  data: { status: string };
}

export function isPublished<T extends HasStatus>(entry: T): boolean {
  return entry.data.status === "published";
}

export function onlyPublished<T extends HasStatus>(entries: readonly T[]): T[] {
  return entries.filter(isPublished);
}

interface Dated {
  id: string;
  data: { firstPublished?: Date | undefined };
}

/** Newest first; ties (and undated entries) by id, A to Z. */
export function byNewest<T extends Dated>(a: T, b: T): number {
  const da = a.data.firstPublished?.getTime() ?? 0;
  const db = b.data.firstPublished?.getTime() ?? 0;
  if (da !== db) return db - da;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function newestFirst<T extends Dated>(entries: readonly T[]): T[] {
  return [...entries].sort(byNewest);
}

/** F3-06 (Q-6): the featured story is the newest published story; a date tie goes to the first id A to Z. */
export function featuredStory<T extends Dated & HasStatus>(entries: readonly T[]): T | undefined {
  return newestFirst(onlyPublished(entries))[0];
}

/**
 * Resolve ids to published entries, in order, leaving out anything unpublished
 * (F3-16, Q-3: the content check has already warned about those).
 * A missing id can't reach here: the content rules fail the build first.
 */
export function publishedByIds<T extends HasStatus & { id: string }>(
  ids: readonly string[],
  published: readonly T[],
): T[] {
  const map = new Map(published.filter(isPublished).map((s) => [s.id, s]));
  return ids.flatMap((id) => {
    const s = map.get(id);
    return s ? [s] : [];
  });
}
