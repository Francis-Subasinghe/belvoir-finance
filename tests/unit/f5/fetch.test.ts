/**
 * F5-26 to F5-30 (N table): the fetcher, only through an injected resolver and
 * transport. TLS (N-20, N-26, N-27) runs a real handshake over an in-memory
 * duplex pair, so no socket is ever opened.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { duplexPair } from "node:stream";
import { createSecureContext, connect as tlsConnect, TLSSocket } from "node:tls";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLOCKED_IPV4, BLOCKED_IPV6, EMBEDDED_IPV4, isBlockedAddress } from "../../../src/lib/intake/address.ts";
import {
  type FetchDeps,
  fetchFeed,
  REQUEST_HEADERS,
  type TransportRequest,
  type TransportResponse,
} from "../../../src/lib/intake/fetch.ts";
import { makeLiveTransport, tlsOptions } from "../../../src/lib/intake/live.ts";

const FEED = "https://feeds.fx-rss.test/rss";
const HOST = "feeds.fx-rss.test";
const PUBLIC = "192.0.2.10";
const at = String.fromCharCode(64);

type Reply = Partial<TransportResponse> & { chunks?: Uint8Array[]; stall?: boolean };
function harness(replies: Record<string, Reply>, dns: Record<string, string[] | Error> = { [HOST]: [PUBLIC] }) {
  const lookups: string[] = [];
  const requests: TransportRequest[] = [];
  let bodyReads = 0;
  const deps: FetchDeps = {
    resolver: async (h) => {
      lookups.push(h);
      const a = dns[h];
      if (!a || a instanceof Error) throw a ?? new Error("ENOTFOUND");
      return a;
    },
    transport: async (req) => {
      requests.push(req);
      const r = replies[req.url] ?? { status: 404 };
      const chunks = r.chunks ?? [Buffer.from("<rss/>")];
      return {
        status: r.status ?? 200,
        headers: r.headers ?? {},
        body: (async function* () {
          for (const c of chunks) {
            bodyReads += 1;
            yield c;
          }
          if (r.stall) await new Promise((res) => setTimeout(res, 60_000));
        })(),
      };
    },
  };
  return { deps, lookups, requests, reads: () => bodyReads };
}
const allowed = new Set([FEED]);

describe("F5-26 registry-only, https-only", () => {
  it("F5-26 N-01 a registry feedUrl resolving to a public address is fetched", async () => {
    const h = harness({ [FEED]: { status: 200 } });
    const r = await fetchFeed(FEED, allowed, h.deps);
    expect(r.ok).toBe(true);
    expect(h.requests.map((q) => [q.url, q.address, q.hostname])).toEqual([[FEED, PUBLIC, HOST]]);
  });
  it("F5-26 N-02 a URL that isn't a selected feedUrl is not-in-registry with 0 lookups", async () => {
    const h = harness({});
    expect(await fetchFeed("https://feeds.fx-rss.test/other", allowed, h.deps)).toEqual({
      ok: false,
      code: "not-in-registry",
    });
    expect(h.lookups).toEqual([]);
  });
  it("F5-26 N-03 an http: URL is not-https with 0 lookups", async () => {
    const h = harness({});
    const u = "http://feeds.fx-rss.test/rss";
    expect(await fetchFeed(u, new Set([u]), h.deps)).toEqual({ ok: false, code: "not-https" });
    expect(h.lookups).toEqual([]);
  });
  it.each([
    "https://192.0.2.10/rss",
    "https://3221225994/rss",
    "https://[::1]/rss",
    `https://user${at}feeds.fx-rss.test/rss`,
    "https://feeds.fx-rss.test:8443/rss",
  ])("F5-26 E-18 %s is bad-host before DNS", async (u) => {
    const h = harness({});
    expect(await fetchFeed(u, new Set([u]), h.deps)).toEqual({ ok: false, code: "bad-host" });
    expect(h.lookups).toEqual([]);
  });
  it("F5-26 an explicit :443 is allowed", async () => {
    const u = "https://feeds.fx-rss.test:443/rss";
    const h = harness({ [FEED]: { status: 200 } });
    expect((await fetchFeed(u, new Set([u]), h.deps)).ok).toBe(true);
  });
});

describe("F5-27 every redirect hop re-checked", () => {
  const redirect = (to: string): Reply => ({ status: 301, headers: { location: to } });
  it("F5-27 N-04 301 to https on the same host is followed, and the hop is resolved and checked again", async () => {
    const h = harness({ [FEED]: redirect("/next"), "https://feeds.fx-rss.test/next": { status: 200 } });
    const r = await fetchFeed(FEED, allowed, h.deps);
    expect(r.ok && r.hops).toEqual([FEED, "https://feeds.fx-rss.test/next"]);
    expect(h.lookups).toEqual([HOST, HOST]);
  });
  it.each([
    ["N-05", "http://feeds.fx-rss.test/rss"],
    ["N-06", "http://169.254.169.254/latest/meta-data/"],
    ["N-07", "https://other.fx-rss.test/rss"],
    ["N-23", "https://2852039166/"],
    ["N-24", "https://[::1]/feed"],
    ["N-29", `https://user${at}feeds.fx-rss.test/rss`],
    ["N-30", "https://feeds.fx-rss.test:8443/rss"],
  ])("F5-27 %s a redirect to %s is redirect-blocked with 0 lookups and 0 requests to it", async (_n, to) => {
    const h = harness({ [FEED]: redirect(to) });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "redirect-blocked" });
    expect(h.requests.map((q) => q.url)).toEqual([FEED]);
    expect(h.lookups).toEqual([HOST]);
  });
  it("F5-27 N-08 three redirects are followed; a fourth is too-many-redirects", async () => {
    const chain = (n: number) =>
      Object.fromEntries(
        Array.from(
          { length: n },
          (_, i) => [i === 0 ? FEED : `https://${HOST}/r${i}`, redirect(`/r${i + 1}`)] as const,
        ),
      );
    const three = harness({ ...chain(3), [`https://${HOST}/r3`]: { status: 200 } });
    expect((await fetchFeed(FEED, allowed, three.deps)).ok).toBe(true);
    const four = harness({ ...chain(4), [`https://${HOST}/r4`]: { status: 200 } });
    expect(await fetchFeed(FEED, allowed, four.deps)).toEqual({ ok: false, code: "too-many-redirects" });
    expect(four.requests).toHaveLength(4);
  });
});

describe("F5-28 addresses checked after DNS", () => {
  it("F5-28 the blocked-range list is pinned", () => {
    expect(BLOCKED_IPV4).toEqual([
      "0.0.0.0/8",
      "10.0.0.0/8",
      "100.64.0.0/10",
      "127.0.0.0/8",
      "169.254.0.0/16",
      "172.16.0.0/12",
      "192.0.0.0/24",
      "192.168.0.0/16",
      "198.18.0.0/15",
      "224.0.0.0/4",
      "240.0.0.0/4",
    ]);
    expect(BLOCKED_IPV6).toEqual(["::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "fd00:ec2::254/128"]);
    expect(EMBEDDED_IPV4.map((e) => e.range)).toEqual(["::ffff:0:0/96", "64:ff9b::/96", "2002::/16"]);
  });
  it.each([
    ["N-09", "127.0.0.1"],
    ["N-10", "10.0.0.5"],
    ["N-10", "172.16.0.1"],
    ["N-10", "192.168.1.1"],
    ["N-10", "100.64.0.1"],
    ["N-10", "0.0.0.0"],
    ["N-10", "169.254.169.254"],
    ["N-10", "224.0.0.1"],
    ["N-10", "255.255.255.255"],
    ["N-11", "::1"],
    ["N-11", "::"],
    ["N-11", "fe80::1"],
    ["N-11", "fc00::1"],
    ["N-11", "fd00:ec2::254"],
    ["N-12", "::ffff:127.0.0.1"],
    ["N-12", "::ffff:169.254.169.254"],
    ["N-12", "::ffff:a9fe:a9fe"],
    ["N-22", "64:ff9b::a9fe:a9fe"],
    ["N-28", "2002:a9fe:a9fe::1"],
  ])("F5-28 %s resolving to %s is blocked-address with 0 requests", async (_n, addr) => {
    expect(isBlockedAddress(addr)).toBe(true);
    const h = harness({ [FEED]: { status: 200 } }, { [HOST]: [addr] });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "blocked-address" });
    expect(h.requests).toEqual([]);
  });
  it.each([
    "192.0.2.10",
    "8.8.8.8",
    "2001:db8::10",
    "2606:4700::1111",
    "::ffff:8.8.8.8",
    "2002:0808:0808::1",
    "64:ff9b::808:808",
  ])("F5-28 public %s is allowed", (addr) => {
    expect(isBlockedAddress(addr)).toBe(false);
  });
  it("F5-28 N-13 one public and one private address: blocked-address", async () => {
    const h = harness({ [FEED]: { status: 200 } }, { [HOST]: [PUBLIC, "10.0.0.5"] });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "blocked-address" });
    expect(h.requests).toEqual([]);
  });
  it("F5-28 N-14 DNS rebinding: one lookup per hop, and the connection goes to the checked address only", async () => {
    let n = 0;
    const h = harness({ [FEED]: { status: 200 } });
    h.deps.resolver = async () => (n++ === 0 ? [PUBLIC] : ["127.0.0.1"]);
    const r = await fetchFeed(FEED, allowed, h.deps);
    expect(r.ok).toBe(true);
    expect(n).toBe(1);
    expect(h.requests.map((q) => q.address)).toEqual([PUBLIC]);
  });
  it("F5-28 N-21 NXDOMAIN is dns-failure", async () => {
    const h = harness({}, {});
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "dns-failure" });
  });
});

describe("F5-29 timeout, size cap and content encodings", () => {
  const MiB2 = 2 * 1024 * 1024;
  it("F5-29 N-15 a server that stalls after the headers is timeout within the deadline + 1 s", async () => {
    const h = harness({ [FEED]: { status: 200, stall: true } });
    const t = performance.now();
    expect(await fetchFeed(FEED, allowed, { ...h.deps, timeoutMs: 300 })).toEqual({ ok: false, code: "timeout" });
    expect(performance.now() - t).toBeLessThan(1300);
  });
  it("F5-29 the deadline also covers DNS", async () => {
    const h = harness({});
    h.deps.resolver = () => new Promise(() => undefined);
    expect(await fetchFeed(FEED, allowed, { ...h.deps, timeoutMs: 200 })).toEqual({ ok: false, code: "timeout" });
  });
  it("F5-29 N-16 a body over 2 MiB with no Content-Length is too-large, aborted as soon as the count passes 2 MiB", async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    const h = harness({ [FEED]: { status: 200, chunks: Array.from({ length: 100 }, () => chunk) } });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "too-large" });
    expect(h.reads()).toBe(MiB2 / chunk.length + 1);
  });
  it("F5-29 N-17 Content-Length: 10 with a body over 2 MiB is too-large while streaming", async () => {
    const h = harness({
      [FEED]: { status: 200, headers: { "content-length": "10" }, chunks: [Buffer.alloc(MiB2 + 1)] },
    });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "too-large" });
  });
  it("F5-29 N-25 Content-Length: 2097153 is too-large with 0 body bytes read; exactly 2 MiB is read", async () => {
    const h = harness({ [FEED]: { status: 200, headers: { "content-length": String(MiB2 + 1) } } });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "too-large" });
    expect(h.reads()).toBe(0);
    const ok = harness({
      [FEED]: { status: 200, headers: { "content-length": String(MiB2) }, chunks: [Buffer.alloc(MiB2)] },
    });
    expect((await fetchFeed(FEED, allowed, ok.deps)).ok).toBe(true);
  });
  it("F5-29 N-18 gzip that inflates past 2 MiB is too-large on the decompressed bytes", async () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(MiB2 / 8);
    const h = harness({ [FEED]: { status: 200, headers: { "content-encoding": "gzip" }, chunks: [bomb] } });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "too-large" });
  });
  it.each(["gzip", "deflate", "br", "identity"])("F5-29 Content-Encoding %s is decoded", async (enc) => {
    const zlib = await import("node:zlib");
    const raw = Buffer.from("<rss/>");
    const body =
      enc === "gzip"
        ? zlib.gzipSync(raw)
        : enc === "deflate"
          ? zlib.deflateSync(raw)
          : enc === "br"
            ? zlib.brotliCompressSync(raw)
            : raw;
    const h = harness({ [FEED]: { status: 200, headers: { "content-encoding": enc }, chunks: [body] } });
    const r = await fetchFeed(FEED, allowed, h.deps);
    expect(r.ok && Buffer.from(r.body).toString()).toBe("<rss/>");
  });
  it.each([
    ["N-31", "zstd"],
    ["N-32", "gzip, gzip"],
    ["N-32", "gzip, br"],
    ["N-32", "compress"],
  ])("F5-29 %s Content-Encoding %s is bad-content-encoding before any body byte", async (_n, enc) => {
    const h = harness({ [FEED]: { status: 200, headers: { "content-encoding": enc } } });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "bad-content-encoding" });
    expect(h.reads()).toBe(0);
  });
  it("F5-33 N-19 a 500 whose body holds a URL, ?token=abc and a token-like string is exactly http-500", async () => {
    const body = Buffer.from(`see https://feeds.fx-rss.test/x?token=abc ${"ghp"}_${"c".repeat(36)}`);
    const h = harness({ [FEED]: { status: 500, chunks: [body] } });
    expect(await fetchFeed(FEED, allowed, h.deps)).toEqual({ ok: false, code: "http-500" });
  });
});

describe("F5-30 etiquette", () => {
  it("F5-30 each request sends exactly the fixed headers: no cookie, no Authorization", async () => {
    const h = harness({ [FEED]: { status: 200 } });
    process.env["HTTPS_PROXY"] = "http://proxy.example.invalid:3128";
    await fetchFeed(FEED, allowed, h.deps);
    delete process.env["HTTPS_PROXY"];
    expect(h.requests[0]?.headers).toEqual({
      "User-Agent": "BelvoirFinanceIntake/0.1.0 (+https://github.com/Francis-Subasinghe/belvoir-finance)",
      Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    });
    expect(REQUEST_HEADERS).not.toHaveProperty("Cookie");
    // Proxy variables are ignored: the request still goes to the checked address.
    expect(h.requests[0]?.address).toBe(PUBLIC);
  });
  it("F5-30 the live transport ignores proxies and verifies TLS: a pinned agent, fixed TLS options", () => {
    const src = readFileSync("src/lib/intake/live.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).toMatch(/agent: pinnedAgent\(/);
    expect(src).not.toMatch(/process\.env|PROXY|rejectUnauthorized:\s*false|checkServerIdentity/i);
    expect(tlsOptions(HOST, PUBLIC)).toEqual({
      host: PUBLIC,
      port: 443,
      servername: HOST,
      rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"],
    });
  });
});

describe("F5-28 TLS is verified against the original hostname (in-memory handshake)", () => {
  let dir = "";
  const pem = (n: string) => readFileSync(join(dir, n));
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "belvoir-f5-tls-"));
    execFileSync("sh", [resolve("tests/fixtures/f5/net/tls/make-certs.sh"), dir]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** A transport whose TLS goes over an in-memory pair to a server presenting `cert`. */
  function transportFor(cert: string, key: string) {
    return makeLiveTransport({
      connect: (opts) => {
        const [client, server] = duplexPair();
        const s = new TLSSocket(server, {
          isServer: true,
          secureContext: createSecureContext({ cert: pem(cert), key: pem(key) }),
          ALPNProtocols: ["http/1.1"],
        });
        s.on("error", () => undefined);
        s.on("data", () => {
          s.end(
            "HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Length: 6\r\nConnection: close\r\n\r\n<rss/>",
          );
        });
        // The test CA is trusted here only; verification itself is never turned off.
        return tlsConnect({ ...opts, socket: client, ca: pem("ca.crt") });
      },
    });
  }
  const run = (cert: string, key: string) =>
    fetchFeed(FEED, allowed, { resolver: async () => [PUBLIC], transport: transportFor(cert, key) });

  it("F5-28 positive control: a CA-signed certificate for the original hostname is accepted at the checked IP", async () => {
    const r = await run("good.crt", "good.key");
    expect(r.ok && Buffer.from(r.body).toString()).toBe("<rss/>");
  });
  it("F5-28 N-26 a valid certificate for a different hostname is tls-error", async () => {
    expect(await run("wrong.crt", "wrong.key")).toEqual({ ok: false, code: "tls-error" });
  });
  it("F5-28 N-27 / N-20 a self-signed certificate is tls-error", async () => {
    expect(await run("self.crt", "self.key")).toEqual({ ok: false, code: "tls-error" });
  });
});
