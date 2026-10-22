/**
 * The live resolver and transport. Reachable only through the CLI's explicit
 * `--live` flag (F5-53); no workflow step selects it in F5, and no test
 * touches the network (D-11): tests inject `connect` with an in-memory TLS pair.
 *
 * F5-28: the socket goes to the checked address, while SNI and certificate
 * verification use the original hostname. `rejectUnauthorized` is always true
 * and nothing here reads an option, flag or environment variable that could
 * turn verification off. F5-30: no proxy (a pinned agent, no env read), no
 * cookies, no Authorization header.
 */
import { lookup } from "node:dns/promises";
import { Agent, request } from "node:https";
import type { Duplex } from "node:stream";
import { connect as tlsConnect, type ConnectionOptions } from "node:tls";
import { type Resolver, type Transport, TransportError, type TransportResponse } from "./fetch.ts";

export const liveResolver: Resolver = async (hostname) => {
  const all = await lookup(hostname, { all: true, verbatim: true });
  return all.map((a) => a.address);
};

/** The only TLS options intake ever uses. */
export function tlsOptions(hostname: string, address: string): ConnectionOptions {
  return { host: address, port: 443, servername: hostname, rejectUnauthorized: true, ALPNProtocols: ["http/1.1"] };
}

const TLS_CODES =
  /^(?:ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_|ERR_TLS_CERT_ALTNAME_INVALID|HOSTNAME_MISMATCH)/;

function pinnedAgent(open: () => Duplex): Agent {
  const agent = new Agent({ keepAlive: false, maxSockets: 1 });
  (agent as unknown as { createConnection: () => Duplex }).createConnection = open;
  return agent;
}

export function makeLiveTransport(deps: { connect?: (opts: ConnectionOptions) => Duplex } = {}): Transport {
  const connect = deps.connect ?? ((opts: ConnectionOptions) => tlsConnect(opts));
  return (req) =>
    new Promise<TransportResponse>((resolve, reject) => {
      const u = new URL(req.url);
      const r = request(
        {
          protocol: "https:",
          hostname: req.hostname,
          port: 443,
          path: `${u.pathname}${u.search}`,
          method: "GET",
          headers: { ...req.headers, Host: req.hostname },
          // A fresh agent per request whose only connection is the pinned one: no
          // pooling, no proxy, no second lookup (an `agent: false` request would
          // ignore createConnection and connect by hostname).
          agent: pinnedAgent(() => connect(tlsOptions(req.hostname, req.address))),
          signal: req.signal,
        },
        (res) => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ status: res.statusCode ?? 0, headers, body: res });
        },
      );
      r.on("error", (e: NodeJS.ErrnoException) => {
        const code = String(e.code ?? "");
        reject(
          new TransportError(
            TLS_CODES.test(code) || /certificate|self.signed|altname/i.test(e.message) ? "tls" : "network",
          ),
        );
      });
      r.end();
    });
}
