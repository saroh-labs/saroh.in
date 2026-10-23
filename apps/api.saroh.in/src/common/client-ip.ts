import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { visitorHashSecret } from "../modules/analytics/visitor-hash";

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
