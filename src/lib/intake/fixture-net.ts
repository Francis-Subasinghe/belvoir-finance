/**
 * The fixture resolver and transport (F5-53): scripted DNS answers and HTTP
 * responses from a committed JSON file, so intake runs end to end with no
 * network. Script shape (tests/fixtures/f5/net/script.json):
 *   { "dns": { "<host>": ["<address>", ...] },
 *     "responses": { "<url>": { "status": 200, "headers": { ... }, "body": "<file relative to the script>" } } }
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Resolver, Transport } from "./fetch.ts";

interface Script {
  dns: Record<string, string[]>;
  responses: Record<string, { status: number; headers?: Record<string, string>; body?: string }>;
}

export function fixtureNet(scriptPath: string): { resolver: Resolver; transport: Transport; requests: string[] } {
  const script = JSON.parse(readFileSync(scriptPath, "utf8")) as Script;
  const base = dirname(scriptPath);
  const requests: string[] = [];
  const resolver: Resolver = async (host) => {
    const a = script.dns[host];
    if (!a) throw new Error("ENOTFOUND");
    return a;
  };
  const transport: Transport = async (req) => {
    requests.push(req.url);
    const r = script.responses[req.url];
    if (!r) return { status: 404, headers: {}, body: (async function* () {})() };
    const bytes = r.body === undefined ? new Uint8Array() : readFileSync(resolve(base, r.body));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = v;
    return {
      status: r.status,
      headers,
      body: (async function* () {
        yield bytes;
      })(),
    };
  };
  return { resolver, transport, requests };
}
