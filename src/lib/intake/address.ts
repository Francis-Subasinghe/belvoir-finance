/**
 * F5-28 (D-3, Q-8): addresses refused after DNS. Pinned by a test. Three IPv6
 * ranges also have their embedded IPv4 address checked against the IPv4 list.
 */
import { isIP } from "node:net";

export const BLOCKED_IPV4 = [
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
] as const;
export const BLOCKED_IPV6 = ["::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "fd00:ec2::254/128"] as const;
/** prefix -> bit offset of the embedded IPv4 address. */
export const EMBEDDED_IPV4 = [
  { range: "::ffff:0:0/96", offset: 96 },
  { range: "64:ff9b::/96", offset: 96 },
  { range: "2002::/16", offset: 16 },
] as const;

function v4ToBig(a: string): bigint {
  return a.split(".").reduce((acc, p) => (acc << 8n) | BigInt(Number(p)), 0n);
}

/** Full IPv6 parse (with an optional dotted IPv4 tail) to a 128-bit integer. */
function v6ToBig(a: string): bigint {
  let s = a.toLowerCase().split("%")[0] ?? "";
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted?.[1]) {
    const v = v4ToBig(dotted[1]);
    s = `${s.slice(0, -dotted[1].length)}${(v >> 16n).toString(16)}:${(v & 0xffffn).toString(16)}`;
  }
  const [head, tail] = s.includes("::") ? (s.split("::") as [string, string]) : [s, undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill("0"), ...t];
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || "0", 16)), 0n);
}

function inRange(value: bigint, bits: number, cidr: string, parse: (a: string) => bigint): boolean {
  const [base, len] = cidr.split("/") as [string, string];
  const n = Number(len);
  const shift = BigInt(bits - n);
  return value >> shift === parse(base) >> shift;
}

const v4Blocked = (v: bigint) => BLOCKED_IPV4.some((c) => inRange(v, 32, c, v4ToBig));

/** True when the address must not be connected to. Anything unparseable is blocked. */
export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return v4Blocked(v4ToBig(address));
  if (kind !== 6) return true;
  const v = v6ToBig(address);
  if (BLOCKED_IPV6.some((c) => inRange(v, 128, c, v6ToBig))) return true;
  for (const { range, offset } of EMBEDDED_IPV4) {
    if (inRange(v, 128, range, v6ToBig)) {
      const embedded = (v >> BigInt(128 - offset - 32)) & 0xffffffffn;
      if (v4Blocked(embedded)) return true;
    }
  }
  return false;
}
