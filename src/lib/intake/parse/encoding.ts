/**
 * F5-17 (Q-19): decide the encoding from the BOM, the XML declaration and the
 * Content-Type charset. They must agree wherever present; nothing is guessed.
 * UTF-8 (BOM optional), UTF-16 with a BOM, and ISO-8859-1 or windows-1252
 * (both decoded as windows-1252).
 */
type Family = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/** Normalise a label; undefined for an unsupported encoding. */
function family(label: string): Family | "utf-16" | undefined {
  const l = label.trim().toLowerCase();
  if (l === "utf-8" || l === "utf8") return "utf-8";
  if (l === "utf-16") return "utf-16";
  if (l === "utf-16le") return "utf-16le";
  if (l === "utf-16be") return "utf-16be";
  if (["iso-8859-1", "iso8859-1", "latin1", "l1", "windows-1252", "cp1252"].includes(l)) return "windows-1252";
  return undefined;
}

const agrees = (declared: Family | "utf-16", actual: Family) =>
  declared === actual || (declared === "utf-16" && (actual === "utf-16le" || actual === "utf-16be"));

const DECL = /^<\?xml\s[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["'][^>]*\?>/;

/** Returns the decoded text (BOM removed) or "bad-encoding". */
export function decodeFeed(bytes: Uint8Array, contentTypeCharset?: string): string | "bad-encoding" {
  let bom: Family | undefined;
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) [bom, start] = ["utf-8", 3];
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) [bom, start] = ["utf-16le", 2];
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) [bom, start] = ["utf-16be", 2];

  const header = contentTypeCharset === undefined ? undefined : family(contentTypeCharset);
  if (contentTypeCharset !== undefined && header === undefined) return "bad-encoding";

  // Read the declaration: from the decoded text for UTF-16, else from the ASCII-compatible bytes.
  let declText: string;
  if (bom === "utf-16le" || bom === "utf-16be") {
    try {
      declText = new TextDecoder(bom, { fatal: true }).decode(bytes.subarray(start, start + 400));
    } catch {
      declText = "";
    }
  } else {
    declText = String.fromCharCode(...bytes.subarray(start, start + 400));
  }
  let declared: Family | "utf-16" | undefined;
  const m = DECL.exec(declText);
  if (m?.[1] !== undefined) {
    declared = family(m[1]);
    if (declared === undefined) return "bad-encoding";
  }

  let actual: Family;
  if (bom) {
    actual = bom;
    if (declared !== undefined && !agrees(declared, actual)) return "bad-encoding";
    if (header !== undefined && !agrees(header, actual)) return "bad-encoding";
  } else {
    if (declared !== undefined && header !== undefined && declared !== header) return "bad-encoding";
    const chosen = declared ?? header ?? "utf-8";
    // UTF-16 needs a BOM (Q-19).
    if (chosen === "utf-16" || chosen === "utf-16le" || chosen === "utf-16be") return "bad-encoding";
    actual = chosen;
  }
  try {
    return new TextDecoder(actual, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start));
  } catch {
    return "bad-encoding";
  }
}

/** The charset parameter of a Content-Type header, if any. */
export function charsetOf(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m?.[1];
}
