import { createHash } from "node:crypto";
import { isIP } from "node:net";

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
 * The caller's address for a rate limit, hashed at once (sha256 of
 * {@link limitAddress}) — the raw IP never leaves the handler. `undefined`
 * when the platform gives no address.
 */
export function hashClientIp(ip: string | undefined): string | undefined {
    return ip
        ? createHash("sha256").update(limitAddress(ip)).digest("hex")
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
