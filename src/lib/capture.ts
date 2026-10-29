import os from "node:os";
import { headers } from "next/headers";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// The address a phone can actually reach. localhost means nothing to a phone, so on a dev machine
// the QR code points at the computer's address on the local network instead.
export function pickBase(host: string | null, proto: string | null, opts: { override?: string; lan?: string | null } = {}): string {
  if (opts.override) return opts.override.replace(/\/$/, "");
  const h = host ?? "localhost:3000";
  const scheme = proto ?? "http";
  if (LOCAL.test(h) && opts.lan) {
    const port = h.match(/:(\d+)$/)?.[1];
    return `${scheme}://${opts.lan}${port ? `:${port}` : ""}`;
  }
  return `${scheme}://${h}`;
}

type Iface = { family: string | number; address: string; internal: boolean };

const VIRTUAL = /vethernet|virtualbox|vmware|docker|wsl|hyper-v|tailscale|zerotier|loopback|bluetooth|vpn|utun|veth|br-/i;
const WIFI = /wi-?fi|wlan|wireless|^en0$|^eth/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

// The address of the network a phone would be on: real Wi-Fi or Ethernet, not a virtual adapter.
export function pickLan(ifaces: Record<string, Iface[] | undefined>): string | null {
  let best: { addr: string; score: number } | null = null;
  for (const [name, list] of Object.entries(ifaces)) {
    if (VIRTUAL.test(name)) continue;
    for (const i of list ?? []) {
      const v4 = i.family === "IPv4" || i.family === 4;
      if (!v4 || i.internal || i.address.startsWith("169.254.")) continue;
      const score = (WIFI.test(name) ? 3 : 0) + (PRIVATE.test(i.address) ? 1 : 0);
      if (!best || score > best.score) best = { addr: i.address, score };
    }
  }
  return best?.addr ?? null;
}

export const lanAddress = () => pickLan(os.networkInterfaces() as Record<string, Iface[] | undefined>);

export function captureBase(): string {
  const h = headers();
  return pickBase(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), {
    override: process.env.PUBLIC_BASE_URL,
    lan: lanAddress(),
  });
}

export const isExpired = (s: { expires_at: string }) => Date.parse(s.expires_at) < Date.now();

export const ALLOWED_EXT = ["webm", "mp4", "mov"] as const;
export const extOf = (s: unknown) => (ALLOWED_EXT as readonly string[]).includes(String(s)) ? String(s) : "webm";
