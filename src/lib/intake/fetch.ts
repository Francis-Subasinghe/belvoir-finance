/**
 * F5-26 to F5-32: fetch one registry feed through an injected resolver and
 * transport. Redirects are followed here, by hand, never by the HTTP client;
 * every hop is re-checked before any lookup or request. The connection goes to
 * the checked address only (no second lookup); the transport verifies TLS
 * against the original hostname (live.ts).
 */
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { isIpLiteralHost } from "../sources/rules.ts";
import { isBlockedAddress } from "./address.ts";
import { INTAKE_LIMITS } from "./parse/limits.ts";

export type FetchError =
  | "not-in-registry"
  | "not-https"
  | "bad-host"
  | "dns-failure"
  | "blocked-address"
  | "redirect-blocked"
  | "too-many-redirects"
  | "tls-error"
  | "timeout"
  | "too-large"
  | "bad-content-encoding"
  | "malformed-xml"
  | `http-${number}`;

export const INTAKE_VERSION = "0.1.0";
/** F5-30 (Q-7): the exact request headers. */
export const REQUEST_HEADERS = {
  "User-Agent": `BelvoirFinanceIntake/${INTAKE_VERSION} (+https://github.com/Francis-Subasinghe/belvoir-finance)`,
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
} as const;

/** Returns every address for the host (or throws). Called once per hop. */
export type Resolver = (hostname: string, signal: AbortSignal) => Promise<string[]>;
export interface TransportRequest {
  url: string;
  hostname: string;
  /** The checked address to connect to; never looked up again. */
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}
export interface TransportResponse {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;
export class TransportError extends Error {
  readonly kind: "tls" | "network";
  constructor(kind: "tls" | "network", message = kind) {
    super(message);
    this.kind = kind;
  }
}

export interface FetchDeps {
  resolver: Resolver;
  transport: Transport;
  /** Overrides for tests only; defaults are INTAKE_LIMITS. */
  timeoutMs?: number;
}
export type FetchResult =
  { ok: true; body: Uint8Array; contentType: string | undefined; hops: string[] } | { ok: false; code: FetchError };

class Fail extends Error {
  readonly code: FetchError;
  constructor(code: FetchError) {
    super(code);
    this.code = code;
  }
}

/** F5-26 / F5-27: the URL shape every hop must have. Returns the parsed URL or a code. */
function checkHop(url: string, onFail: FetchError, expectedHost?: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Fail(onFail === "redirect-blocked" ? onFail : "not-https");
  }
  if (u.protocol !== "https:") throw new Fail(onFail === "redirect-blocked" ? onFail : "not-https");
  if (u.username || u.password || u.port !== "" || !u.hostname || isIpLiteralHost(u.hostname))
    throw new Fail(onFail === "redirect-blocked" ? onFail : "bad-host");
  if (expectedHost !== undefined && u.hostname !== expectedHost) throw new Fail("redirect-blocked");
  return u;
}

const ENCODINGS = new Set(["identity", "gzip", "x-gzip", "deflate", "br"]);

export async function fetchFeed(url: string, allowed: ReadonlySet<string>, deps: FetchDeps): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? INTAKE_LIMITS.timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Fail("timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(url, allowed, deps, controller.signal), deadline]);
  } catch (e) {
    if (e instanceof Fail) return { ok: false, code: e.code };
    if (controller.signal.aborted) return { ok: false, code: "timeout" };
    if (e instanceof TransportError && e.kind === "tls") return { ok: false, code: "tls-error" };
    // A connection that fails before any response (refused, reset). The E table has no
    // separate code for this, so it is recorded as `timeout` (flagged in the PR).
    return { ok: false, code: "timeout" };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function run(
  url: string,
  allowed: ReadonlySet<string>,
  deps: FetchDeps,
  signal: AbortSignal,
): Promise<FetchResult> {
  // F5-26: refused before any DNS lookup.
  const first = checkHop(url, "not-https");
  if (!allowed.has(url)) throw new Fail("not-in-registry");
  const host = first.hostname;
  const hops: string[] = [];
  let current = first;
  for (let redirects = 0; ; redirects++) {
    // F5-28: every address is checked; one blocked address refuses the fetch.
    let addresses: string[];
    try {
      addresses = await deps.resolver(current.hostname, signal);
    } catch {
      if (signal.aborted) throw new Fail("timeout");
      throw new Fail("dns-failure");
    }
    if (addresses.length === 0) throw new Fail("dns-failure");
    if (addresses.some(isBlockedAddress)) throw new Fail("blocked-address");
    const address = addresses[0] as string;
    hops.push(current.href);
    let res: TransportResponse;
    try {
      res = await deps.transport({
        url: current.href,
        hostname: current.hostname,
        address,
        headers: { ...REQUEST_HEADERS },
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw new Fail("timeout");
      if (e instanceof TransportError && e.kind === "tls") throw new Fail("tls-error");
      throw e;
    }
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers["location"] !== undefined) {
      // F5-27: re-check the next hop in full before anything else.
      let next: string;
      try {
        next = new URL(res.headers["location"], current).href;
      } catch {
        throw new Fail("redirect-blocked");
      }
      const nextUrl = checkHop(next, "redirect-blocked", host);
      if (redirects + 1 > INTAKE_LIMITS.maxRedirects) throw new Fail("too-many-redirects");
      current = nextUrl;
      continue;
    }
    if (res.status !== 200) throw new Fail(`http-${res.status}`);
    const body = await readBody(res, signal);
    return { ok: true, body, contentType: res.headers["content-type"], hops };
  }
}

/** F5-29: Content-Length precheck, then count decompressed bytes while streaming. */
async function readBody(res: TransportResponse, signal: AbortSignal): Promise<Uint8Array> {
  const cap = INTAKE_LIMITS.maxBytes;
  const len = res.headers["content-length"];
  if (len !== undefined && /^\d+$/.test(len.trim()) && Number(len) > cap) throw new Fail("too-large");
  const enc = (res.headers["content-encoding"] ?? "").trim().toLowerCase();
  const codings = enc === "" ? [] : enc.split(",").map((c) => c.trim());
  if (codings.length > 1 || (codings.length === 1 && !ENCODINGS.has(codings[0] as string)))
    throw new Fail("bad-content-encoding");
  const coding = codings[0] ?? "identity";
  const out: Uint8Array[] = [];
  let total = 0;
  const take = (chunk: Uint8Array) => {
    total += chunk.length;
    if (total > cap) throw new Fail("too-large");
    out.push(chunk);
  };
  if (coding === "identity") {
    for await (const chunk of res.body) {
      if (signal.aborted) throw new Fail("timeout");
      take(chunk);
    }
  } else {
    const z = coding === "br" ? createBrotliDecompress() : coding === "deflate" ? createInflate() : createGunzip();
    const done = new Promise<void>((resolve, reject) => {
      z.on("data", (c: Buffer) => {
        try {
          take(c);
        } catch (e) {
          z.destroy();
          reject(e);
        }
      });
      z.on("end", resolve);
      z.on("error", (e) => reject(e instanceof Fail ? e : new Fail("malformed-xml")));
    });
    void done.catch(() => undefined);
    try {
      for await (const chunk of res.body) {
        if (signal.aborted) throw new Fail("timeout");
        if (z.destroyed) break;
        if (!z.write(chunk)) await new Promise<void>((r) => z.once("drain", r));
      }
      z.end();
    } catch (e) {
      z.destroy();
      throw e;
    }
    await done;
  }
  return Buffer.concat(out);
}
