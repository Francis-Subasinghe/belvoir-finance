/** F5-14 / F5-29 (Q-5): every intake limit, in one pinned constant. */
export const INTAKE_LIMITS = {
  /** Bytes per feed, compressed and decompressed. */
  maxBytes: 2 * 1024 * 1024,
  maxItems: 200,
  /** Element nesting depth. */
  maxDepth: 32,
  /** One deadline for DNS, connect, headers and body. */
  timeoutMs: 15_000,
  maxRedirects: 3,
  /** UTF-16 code units. */
  titleMax: 300,
  excerptMax: 500,
} as const;
