import { createHmac } from "node:crypto";
import { BlockList, isIP } from "node:net";

import { visitorHashSecret } from "../modules/analytics/visitor-hash";
import { trustedProxyRanges } from "./trust-proxy";

/**
 * The address a public rate limit counts a caller by. IPv4 as it is — an
 * IPv4-mapped IPv6 address ("::ffff:203.0.113.7") is its IPv4. IPv6 as its
 * /64, the block one subscriber is given: every address in it is one
 * caller, so rotating through it does not reset the limit. Anything that is
 * not an address passes through.
 */
export function limitAddress(ip: string): string {
    const address = ip.trim().toLowerCase().split("%")[0] ?? "";
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
    if (mapped?.[1] && isIP(mapped[1]) === 4) return mapped[1];
    if (isIP(address) !== 6) return address;
    return `${hextets(address).slice(0, 4).join(":")}::/64`;
}

/**
 * The caller's address for a rate limit, hashed at once — the raw IP never
 * leaves the handler. `undefined` when the platform gives no address.
 *
 * Keyed with the server's secret (an HMAC of {@link limitAddress}), not a
 * plain sha256: there are only four billion IPv4 addresses, so a plain hash
 * in a stored row gives the address back to anyone who tries them all.
 */
export function hashClientIp(
    ip: string | undefined,
    secret: string = visitorHashSecret(),
): string | undefined {
    return ip
        ? createHmac("sha256", secret)
              .update(`client-ip:${limitAddress(ip)}`)
              .digest("hex")
        : undefined;
}

/** An IPv6 address's eight groups, "::" expanded and leading zeros dropped. */
function hextets(address: string): string[] {
    const [head = "", tail = ""] = address.split("::");
    const groups = (part: string) =>
        part === ""
            ? []
            : part.split(":").flatMap((g) => {
                  // A trailing dotted quad ("::1.2.3.4") is two groups.
                  if (!g.includes(".")) return [g];
                  const [a = 0, b = 0, c = 0, d = 0] = g.split(".").map(Number);
                  return [
                      ((a << 8) | b).toString(16),
                      ((c << 8) | d).toString(16),
                  ];
              });
    const left = groups(head);
    const right = groups(tail);
    const zeros = Array.from(
        { length: 8 - left.length - right.length },
        () => "0",
    );
    return [...left, ...zeros, ...right].map((g) =>
        parseInt(g, 16).toString(16),
    );
}

/** Cloudflare's edge and the private network: who may hand us `CF-Connecting-IP`. */
const CLOUDFLARE_PATH = new BlockList();
for (const range of trustedProxyRanges("cloudflare")) {
    const [net = "", bits = ""] = range.split("/");
    CLOUDFLARE_PATH.addSubnet(
        net,
        Number(bits),
        isIP(net) === 6 ? "ipv6" : "ipv4",
    );
}

/**
 * Who a per-visitor limit counts (plan 2026-11-10-001): `CF-Connecting-IP`
 * when the socket's peer is the tunnel or Cloudflare (`TRUST_PROXY` is
 * `cloudflare`), which writes it over anything the visitor sent; otherwise
 * the socket's own address. Never `X-Forwarded-For`, which the caller writes.
 */
export function visitorAddress(
    req: {
        headers: Record<string, string | string[] | undefined>;
        socket?: { remoteAddress?: string };
    },
    trustProxyMode: string | undefined,
): string | undefined {
    const raw = req.socket?.remoteAddress;
    const peer = raw?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
    const cf = req.headers["cf-connecting-ip"];
    const named = (Array.isArray(cf) ? cf[0] : cf)?.trim();
    const kind = peer ? isIP(peer) : 0;
    if (
        trustProxyMode === "cloudflare" &&
        peer &&
        kind &&
        named &&
        isIP(named) &&
        CLOUDFLARE_PATH.check(peer, kind === 6 ? "ipv6" : "ipv4")
    ) {
        return named;
    }
    return peer;
}
