import { parse } from "tldts";

/**
 * Is this hostname a bare domain (DEC-140)?
 *
 * A bare domain is the name a business registered, with nothing in front:
 * `example.com`, `example.co.in`. Many DNS providers refuse a CNAME record
 * on one, so the connect flow treats it differently from `www.example.com`
 * or `shop.example.com`.
 *
 * Where the registered name ends depends on the suffix under it (`.com` is
 * one label, `.co.in` two), and only the Public Suffix List knows every
 * one, so this asks `tldts`, which ships the list. Suffixes a company
 * sells names under (`uk.com`, `in.net`) count too: a business that bought
 * `example.uk.com` owns a bare domain like any other.
 *
 * Pure. `hostname` is already lower-case with no scheme, port or final dot
 * (`bareHostname` in `dto.ts`).
 */

/**
 * - `bare`: the registered name itself (`example.co.in`).
 * - `www`: `www.` on a bare domain (`www.example.co.in`), the address the
 *   bare domain forwards to.
 * - `subdomain`: anything else (`shop.example.co.in`, `www.shop.example.com`),
 *   and a name the list can't place.
 */
export type HostnameKind = "bare" | "www" | "subdomain";

export interface HostnameShape {
    kind: HostnameKind;
    /** The bare domain this hostname is, or is the `www` of; else null. */
    bare: string | null;
}

const NOT_BARE: HostnameShape = { kind: "subdomain", bare: null };

export function hostnameShape(hostname: string): HostnameShape {
    const host = hostname.trim().toLowerCase();
    const parsed = parse(host, { allowPrivateDomains: true });
    // An address, or a suffix on its own (`co.in`): no registered name.
    if (parsed.isIp || !parsed.domain) return NOT_BARE;
    if (host === parsed.domain) return { kind: "bare", bare: parsed.domain };
    if (parsed.subdomain === "www") {
        return { kind: "www", bare: parsed.domain };
    }
    return NOT_BARE;
}

/** The `www` address of a bare domain. */
export function wwwOf(bare: string): string {
    return `www.${bare}`;
}
