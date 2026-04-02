/**
 * Local reverse proxy for MechArm.
 *
 * Forwards localhost:8080 → mecharm.local:8080 (TCP-level proxy).
 * Handles HTTP, WebSocket, and MJPEG streaming transparently.
 *
 * Needed because browsers can't reliably connect to .local mDNS hosts
 * on NAT64/IPv6-only networks, and Python's socket module can't connect
 * to the Pi's IPv6 address. Node.js handles both correctly.
 *
 * Usage:
 *   node proxy.mjs
 *   # Then open http://localhost:8080 in your browser
 */

import { createServer, createConnection } from "net";
import { lookup } from "dns";

const LOCAL_PORT = 3000;
const REMOTE_HOST = "mecharm.local";
const REMOTE_PORT = 80;

/** Resolve mecharm.local once at startup, re-resolve on failure. */
function resolveHost() {
  return new Promise((resolve, reject) => {
    lookup(REMOTE_HOST, { all: true }, (err, addrs) => {
      if (err) return reject(err);
      // Prefer IPv6 (works on NAT64 networks)
      const ipv6 = addrs.find((a) => a.family === 6);
      if (ipv6) return resolve({ host: ipv6.address, family: 6 });
      const ipv4 = addrs.find((a) => a.family === 4);
      if (ipv4) return resolve({ host: ipv4.address, family: 4 });
      reject(new Error(`Cannot resolve ${REMOTE_HOST}`));
    });
  });
}

let cached = null;

async function getRemote() {
  if (!cached) cached = await resolveHost();
  return cached;
}

const server = createServer(async (local) => {
  try {
    const { host, family } = await getRemote();
    const remote = createConnection({ host, port: REMOTE_PORT, family }, () => {
      local.pipe(remote);
      remote.pipe(local);
    });
    remote.on("error", (e) => {
      cached = null; // re-resolve next time
      local.destroy();
    });
    local.on("error", () => remote.destroy());
    local.on("close", () => remote.destroy());
    remote.on("close", () => local.destroy());
  } catch (e) {
    console.error("  proxy error:", e.message);
    cached = null;
    local.destroy();
  }
});

const { host } = await getRemote();
server.listen(LOCAL_PORT, "127.0.0.1", () => {
  console.log(
    `MechArm proxy: http://localhost:${LOCAL_PORT}  →  ${REMOTE_HOST}:${REMOTE_PORT} (${host})`
  );
  console.log(`Open http://localhost:${LOCAL_PORT} in your browser.`);
});
