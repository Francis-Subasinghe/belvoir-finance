/**
 * F5-41 (D-11): no test reaches the network. Loaded as a Vitest setup file for
 * the unit, build and gallery suites: fetch, DNS lookups and socket connects
 * throw. In-memory TLS (duplexPair) and child processes are unaffected.
 */
import dns from "node:dns";
import net from "node:net";

export class NetworkBlocked extends Error {
  constructor(what: string) {
    super(`F5-41: ${what} is blocked in tests (no network at build or test time)`);
  }
}
const block = (what: string) => () => {
  throw new NetworkBlocked(what);
};

globalThis.fetch = block("fetch") as typeof fetch;
// A lookup of an IP literal makes no DNS query (Node's own listen() does one for 127.0.0.1); names throw.
const realLookup = dns.lookup;
dns.lookup = ((host: string, ...rest: unknown[]) => {
  if (net.isIP(host) === 0) throw new NetworkBlocked(`dns.lookup(${JSON.stringify(host)})`);
  return (realLookup as (...a: unknown[]) => unknown)(host, ...rest);
}) as unknown as typeof dns.lookup;
dns.resolve = block("dns.resolve") as unknown as typeof dns.resolve;
dns.promises.lookup = block("dns.promises.lookup") as unknown as typeof dns.promises.lookup;
dns.promises.resolve = block("dns.promises.resolve") as unknown as typeof dns.promises.resolve;
net.connect = block("net.connect") as unknown as typeof net.connect;
net.createConnection = block("net.createConnection") as unknown as typeof net.createConnection;
// Socket connects throw unless they go to a loopback IP literal (a server the test itself
// started, e.g. the Lighthouse port preflight). Pipes and IPC are not connects.
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const first = args[0];
  const opts = (Array.isArray(first) ? first[0] : first) as { host?: string; path?: string } | number | string;
  const host =
    typeof opts === "object" && opts !== null
      ? opts.path !== undefined
        ? "pipe"
        : (opts.host ?? "localhost")
      : typeof opts === "number"
        ? String(args[1] ?? "localhost")
        : "pipe";
  if (host !== "pipe" && host !== "127.0.0.1" && host !== "::1")
    throw new NetworkBlocked(`net.Socket.connect(${JSON.stringify(host)})`);
  return (realConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
