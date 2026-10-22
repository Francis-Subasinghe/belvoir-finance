// F5-41 negative fixture: a "test" that reaches the network. The no-network setup must make it throw.
import dns from "node:dns";
import net from "node:net";

export const reachers: Record<string, () => unknown> = {
  fetch: () => fetch("https://feeds.example.invalid/"),
  dns: () => dns.lookup("feeds.example.invalid", () => undefined),
  dnsPromises: () => dns.promises.lookup("feeds.example.invalid"),
  connect: () => net.connect(443, "feeds.example.invalid"),
  socket: () => new net.Socket().connect(443, "192.0.2.10"),
};
