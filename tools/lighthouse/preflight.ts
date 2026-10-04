// Fails if the Lighthouse preview port (127.0.0.1:4329) is already in use, so lhci
// never audits a server that isn't ours. lighthouserc.cjs runs it before `lhci collect`
// (lhci keeps going against the URLs even if its own server fails to start).
import { connect, createServer } from "node:net";
import { HOST, PORT } from "./assertions.ts";

/** True if something accepts connections on host:port, or the port can't be bound there. */
export async function portInUse(host: string, port: number): Promise<boolean> {
  const accepts = await new Promise<boolean>((resolve) => {
    const socket = connect({ host, port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
  if (accepts) return true;
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.listen({ host, port, exclusive: true }, () => server.close(() => resolve(false)));
  });
}

if (import.meta.main) {
  if (await portInUse(HOST, PORT)) {
    console.error(`::error::${HOST}:${PORT} is already in use. Stop that server before running Lighthouse.`);
    process.exit(1);
  }
  console.log(`${HOST}:${PORT} is free.`);
}
