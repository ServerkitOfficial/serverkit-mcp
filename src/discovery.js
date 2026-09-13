import dgram from 'node:dgram';
import os from 'node:os';

// Discovery protocol (self-contained, no dependency on any MCP library):
// this process sends a UDP broadcast on DISCOVERY_PORT; a ServerKit phone
// listening on that port answers with a unicast reply naming its MCP URL.
// Both sides must agree on the port and the two message shapes below.
export const DISCOVERY_PORT = 41234;
const REQUEST = { type: 'serverkit-discover', v: 1 };

/**
 * Per-interface subnet broadcast addresses (e.g. 192.168.0.255), computed
 * from each non-internal IPv4 interface's address + netmask.
 *
 * The global limited-broadcast address (255.255.255.255) is NOT reliable on
 * a multi-homed host (WiFi + VPN + virtual adapters, which is most laptops)
 * - the OS picks one interface to send it out and it's often the wrong one.
 * Sending to the actual subnet broadcast address on every interface finds
 * the target regardless of which interface the OS would have guessed.
 */
function subnetBroadcastAddresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ipParts = iface.address.split('.').map(Number);
      const maskParts = iface.netmask.split('.').map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) continue;
      const broadcast = ipParts.map((byte, i) => (byte | (255 - maskParts[i]))).join('.');
      addrs.push(broadcast);
    }
  }
  return addrs;
}

/**
 * Broadcasts a discovery request and collects responses for `timeoutMs`.
 * Returns a de-duplicated (by url) list of { name, url }.
 *
 * UDP broadcast has no delivery guarantee - a single lost packet (common
 * right after Wi-Fi association, or just ordinary broadcast drop) means no
 * reply ever arrives even though the phone was listening the whole time. So
 * this resends the request every `retryIntervalMs` for the whole window
 * instead of firing once and hoping, and stops early once something answers.
 */
export function discoverServers({ timeoutMs = 2500, retryIntervalMs = 400 } = {}) {
  return new Promise((resolve) => {
    const found = new Map(); // url -> name
    const socket = dgram.createSocket('udp4');
    let retryTimer;

    const finish = () => {
      clearInterval(retryTimer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve([...found.entries()].map(([url, name]) => ({ name, url })));
    };

    socket.on('error', finish);

    socket.on('message', (msg) => {
      let parsed;
      try {
        parsed = JSON.parse(msg.toString('utf8'));
      } catch {
        return;
      }
      if (parsed?.type !== 'serverkit-announce' || typeof parsed.url !== 'string') {
        return;
      }
      found.set(parsed.url, parsed.name ?? 'ServerKit');
      // Got at least one reply - give other phones a brief moment to answer
      // too, then stop instead of waiting out the full timeout.
      clearInterval(retryTimer);
      setTimeout(finish, 300);
    });

    const broadcast = () => {
      socket.setBroadcast(true);
      const payload = Buffer.from(JSON.stringify(REQUEST), 'utf8');
      const targets = new Set([...subnetBroadcastAddresses(), '255.255.255.255']);
      for (const addr of targets) {
        socket.send(payload, DISCOVERY_PORT, addr);
      }
    };

    socket.bind(() => {
      broadcast();
      retryTimer = setInterval(broadcast, retryIntervalMs);
    });

    setTimeout(finish, timeoutMs);
  });
}
