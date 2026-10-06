import type { LookupAddress } from "node:dns";
import { Resolver as DnsResolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * The link preview tool's guard (resources plan U2, KTD-3): the only code in
 * Saroh that fetches an address a stranger typed, so the only place that
 * decides which addresses may be fetched at all.
 *
 * Three rules, in this order, for the first address and again for every
 * redirect:
 *
 * 1. **The address itself** ({@link checkTarget}): `http` or `https`, no
 *    user name or password, a host with a dot in it, one of the usual web
 *    ports, at most {@link MAX_URL_LENGTH} characters.
 * 2. **Where the host points** ({@link resolveTarget}): resolved ONCE —
 *    over DNS itself, never the system's `getaddrinfo` (see
 *    {@link systemResolver}), within {@link DNS_TIMEOUT_MS} — and
 *    refused when ANY of its addresses is private, loopback, link-local,
 *    CGNAT, unique-local, multicast, unspecified, reserved or a cloud
 *    metadata address — IPv4 and IPv6, an IPv4-mapped IPv6 address judged
 *    as the IPv4 inside it ({@link isPublicAddress}).
 * 3. **The connection goes to the address that was checked**
 *    ({@link pinnedLookup}): the socket's own name lookup is replaced by one
 *    that answers with that address and never asks DNS again. A host whose
 *    records change between the check and the connect (DNS rebinding) can't
 *    move the connection: there is no second lookup to change.
 *
 * Browser tests point the tool at a page served on the test machine, which
 * rule 2 refuses. `LINK_PREVIEW_TEST_HOSTS` names hosts that may resolve to
 * loopback (and only loopback); the environment refuses to boot with it in
 * production (`env.ts`), and {@link testHostsFrom} honours it only where
 * the process says it is a test run (`NODE_ENV=test`, or `CI` set).
 */

export const MAX_URL_LENGTH = 2048;

/** The ports a web page is served on. Anything else isn't fetched. */
const WEB_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** Names that never point at the public internet. */
const LOCAL_SUFFIXES = [
    ".localhost",
    ".local",
    ".internal",
    ".home.arpa",
    ".lan",
];

export type GuardFailure = "invalid" | "blocked" | "unreachable" | "timeout";

/** Why an address was refused, for logs and for the page's words. */
export type GuardReason =
    | "empty"
    | "malformed"
    | "too-long"
    | "scheme"
    | "credentials"
    | "port"
    | "local-name"
    | "private-address"
    | "dns";

export type TargetCheck =
    | { ok: true; url: URL }
    | { ok: false; failure: GuardFailure; reason: GuardReason };

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** IPv4 ranges that are not the public internet (IANA special-purpose). */
const V4_NOT_PUBLIC: [string, number][] = [
    ["0.0.0.0", 8], // "this network", incl. the unspecified 0.0.0.0
    ["10.0.0.0", 8], // private
    ["100.64.0.0", 10], // CGNAT (and 100.100.100.200, Alibaba's metadata)
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
    ["172.16.0.0", 12], // private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // documentation
    ["192.88.99.0", 24], // 6to4 relay anycast
    ["192.168.0.0", 16], // private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // documentation
    ["203.0.113.0", 24], // documentation
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved, incl. 255.255.255.255 broadcast
];

/**
 * IPv6 is judged the other way round: only global unicast (2000::/3) can be
 * public, which already leaves out ::, ::1, fc00::/7 (unique-local, incl.
 * AWS's fd00:ec2::254 metadata), fe80::/10 (link-local), ff00::/8
 * (multicast), 64:ff9b::/96 (NAT64) and ::ffff:0:0/96 (mapped, judged as
 * its IPv4 instead). Inside 2000::/3 these are still not someone's website:
 */
const V6_NOT_PUBLIC: [string, number][] = [
    ["2001::", 23], // IETF protocol assignments, incl. Teredo 2001::/32
    ["2001:db8::", 32], // documentation
    ["2002::", 16], // 6to4: carries an IPv4 address of any kind
];

const v4Blocked = new BlockList();
for (const [net, prefix] of V4_NOT_PUBLIC) {
    v4Blocked.addSubnet(net, prefix, "ipv4");
}
const v6Global = new BlockList();
v6Global.addSubnet("2000::", 3, "ipv6");
const v6Blocked = new BlockList();
for (const [net, prefix] of V6_NOT_PUBLIC) {
    v6Blocked.addSubnet(net, prefix, "ipv6");
}

/** An address as compared: lower-case, no brackets, no zone. */
function bare(ip: string): string {
    return (
        ip
            .trim()
            .toLowerCase()
            .replace(/^\[|\]$/g, "")
            .split("%")[0] ?? ""
    );
}

/** The eight groups of an IPv6 address as numbers, or null. */
function hextets(address: string): number[] | null {
    if (isIP(address) !== 6) return null;
    const [head = "", tail = ""] = address.split("::");
    const groups = (part: string): number[] =>
        part === ""
            ? []
            : part.split(":").flatMap((g) => {
                  if (!g.includes(".")) return [parseInt(g, 16)];
                  // A trailing dotted quad ("::ffff:1.2.3.4") is two groups.
                  const [a = 0, b = 0, c = 0, d = 0] = g.split(".").map(Number);
                  return [(a << 8) | b, (c << 8) | d];
              });
    const left = groups(head);
    const right = groups(tail);
    if (!address.includes("::")) return left.length === 8 ? left : null;
    const zeros = new Array<number>(8 - left.length - right.length).fill(0);
    return [...left, ...zeros, ...right];
}

/**
 * The IPv4 address inside an IPv4-mapped IPv6 one (::ffff:a.b.c.d, in
 * either spelling), or null. The socket would reach that IPv4 address, so
 * it is judged as one.
 */
export function mappedIpv4(address: string): string | null {
    const h = hextets(bare(address));
    if (!h) return null;
    if (h.slice(0, 5).some((g) => g !== 0) || h[5] !== 0xffff) return null;
    const hi = h[6] ?? 0;
    const lo = h[7] ?? 0;
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/** Whether a connection to this address reaches the public internet. */
export function isPublicAddress(ip: string): boolean {
    const address = bare(ip);
    const version = isIP(address);
    if (version === 4) return !v4Blocked.check(address, "ipv4");
    if (version !== 6) return false;
    const inner = mappedIpv4(address);
    if (inner) return isPublicAddress(inner);
    return v6Global.check(address, "ipv6") && !v6Blocked.check(address, "ipv6");
}

/** Loopback: what a test host may resolve to, and nothing more. */
export function isLoopbackAddress(ip: string): boolean {
    const address = bare(ip);
    const inner = mappedIpv4(address) ?? address;
    if (isIP(inner) === 4) return inner.startsWith("127.");
    return inner === "::1";
}

// ---------------------------------------------------------------------------
// The address as typed
// ---------------------------------------------------------------------------

/**
 * The test-only hosts, or none. Honoured only in a run that says it is a
 * test: `NODE_ENV` declared `test` (Jest), or `CI` set (the browser-test
 * stack, in CI and in `scripts/prepush.sh`, runs the built API with no
 * `NODE_ENV`). Never under a declared `production`, whatever else is set —
 * and the environment refuses to boot with the variable there anyway. So a
 * staging host that copied the variable, with `NODE_ENV=development` or
 * none, does not get a way to loopback.
 */
export function testHostsFrom(
    value: string | undefined,
    run: { nodeEnvs: (string | undefined)[]; ci?: string },
): ReadonlySet<string> {
    if (!value || run.nodeEnvs.includes("production")) return new Set();
    const ci = (run.ci ?? "").trim().toLowerCase();
    const testRun =
        run.nodeEnvs[0] === "test" ||
        (ci !== "" && ci !== "false" && ci !== "0");
    if (!testRun) return new Set();
    return new Set(
        value
            .split(",")
            .map((h) => h.trim().toLowerCase())
            .filter(Boolean),
    );
}

function refuse(failure: GuardFailure, reason: GuardReason): TargetCheck {
    return { ok: false, failure, reason };
}

/**
 * What someone typed, as the address to fetch: `https://` added when they
 * left it off (they mostly do), the fragment dropped. Refuses anything the
 * tool must not fetch before any lookup happens.
 */
export function checkTarget(
    raw: string,
    testHosts: ReadonlySet<string> = new Set(),
): TargetCheck {
    const text = raw.trim();
    if (!text) return refuse("invalid", "empty");
    if (text.length > MAX_URL_LENGTH) return refuse("invalid", "too-long");

    let candidate = text;
    if (!/^https?:\/\//i.test(text)) {
        // "mailto:…", "javascript:…", "ftp://…" are schemes; "shop.in:8080"
        // is a host and port, so a colon before a digit isn't one.
        if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) {
            return refuse("invalid", "scheme");
        }
        candidate = `https://${text}`;
    }

    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return refuse("invalid", "malformed");
    }
    return checkUrl(url, testHosts);
}

/** The same rules for an address already parsed: a redirect's `Location`. */
export function checkUrl(
    input: URL,
    testHosts: ReadonlySet<string> = new Set(),
): TargetCheck {
    const url = new URL(input.href);
    url.hash = "";
    if (url.href.length > MAX_URL_LENGTH) return refuse("invalid", "too-long");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return refuse("invalid", "scheme");
    }
    if (url.username || url.password) {
        return refuse("invalid", "credentials");
    }
    const host = bare(url.hostname);
    if (!host) return refuse("invalid", "malformed");
    const testHost = testHosts.has(host);
    if (!testHost && !WEB_PORTS.has(url.port)) {
        return refuse("invalid", "port");
    }
    if (isIP(host) !== 0) {
        return isPublicAddress(host) || (testHost && isLoopbackAddress(host))
            ? { ok: true, url }
            : refuse("blocked", "private-address");
    }
    if (!testHost) {
        if (
            !host.includes(".") ||
            host === "localhost" ||
            LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
        ) {
            return refuse("blocked", "local-name");
        }
    }
    return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Where the host points
// ---------------------------------------------------------------------------

/** Every address a host name resolves to. */
export type Resolver = (host: string) => Promise<LookupAddress[]>;

/** How long a name may take to resolve before the check says "timed out". */
export const DNS_TIMEOUT_MS = 1_500;

/**
 * The system's DNS servers, asked directly (c-ares), for A and AAAA
 * records at once: every address, IPv4 first.
 *
 * Never `dns.lookup`: that is `getaddrinfo`, which runs on libuv's
 * four-thread pool and can't be cancelled. A stranger's name whose
 * nameserver never answers would hold a thread for 10–30 seconds per
 * check, and a few such checks at once would queue every other user of
 * the pool behind them — SMTP, payment and database connects, files, zlib,
 * crypto. c-ares queries are sockets on the event loop: a slow name costs a
 * timer, and {@link DNS_TIMEOUT_MS} later the resolver is cancelled.
 *
 * c-ares does not read `/etc/hosts`, so a test host must be an address
 * (`127.0.0.1`), not `localhost`.
 */
export const systemResolver: Resolver = async (host) => {
    const resolver = new DnsResolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    const timer = setTimeout(() => resolver.cancel(), DNS_TIMEOUT_MS + 100);
    try {
        const [v4, v6] = await Promise.allSettled([
            resolver.resolve4(host),
            resolver.resolve6(host),
        ]);
        // A name the DNS couldn't answer for at all is unreachable. A name
        // with records of one family only is fine: the connection is pinned
        // to an address that was checked, so a family that didn't answer
        // can't be reached either.
        if (v4.status === "rejected" && v6.status === "rejected") {
            throw v4.reason instanceof Error ? v4.reason : new Error("dns");
        }
        return [
            ...(v4.status === "fulfilled" ? v4.value : []).map(
                (address): LookupAddress => ({ address, family: 4 }),
            ),
            ...(v6.status === "fulfilled" ? v6.value : []).map(
                (address): LookupAddress => ({ address, family: 6 }),
            ),
        ];
    } finally {
        clearTimeout(timer);
    }
};

class DnsTimeout extends Error {}

/** The resolver's answer, or {@link DnsTimeout} once `ms` have passed. */
function withinDnsTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DnsTimeout()), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The one address a fetch may connect to, checked. */
export interface PinnedAddress {
    address: string;
    family: 4 | 6;
}

export type ResolveResult =
    | { ok: true; pinned: PinnedAddress }
    | { ok: false; failure: GuardFailure; reason: GuardReason };

/**
 * Resolve the URL's host once and pick the address to connect to. Refused
 * when any address the host has is not public: a host with one public and
 * one private record could otherwise be steered to the private one.
 */
export async function resolveTarget(
    url: URL,
    resolver: Resolver,
    testHosts: ReadonlySet<string> = new Set(),
    dnsTimeoutMs: number = DNS_TIMEOUT_MS,
): Promise<ResolveResult> {
    const host = bare(url.hostname);
    const literal = isIP(host);
    const testHost = testHosts.has(host);
    const allowed = (address: string) =>
        isPublicAddress(address) || (testHost && isLoopbackAddress(address));

    if (literal !== 0) {
        return allowed(host)
            ? { ok: true, pinned: { address: host, family: literal as 4 | 6 } }
            : { ok: false, failure: "blocked", reason: "private-address" };
    }

    let addresses: LookupAddress[];
    try {
        addresses = await withinDnsTimeout(resolver(host), dnsTimeoutMs);
    } catch (error) {
        return error instanceof DnsTimeout
            ? { ok: false, failure: "timeout", reason: "dns" }
            : { ok: false, failure: "unreachable", reason: "dns" };
    }
    if (addresses.length === 0) {
        return { ok: false, failure: "unreachable", reason: "dns" };
    }
    if (!addresses.every((a) => allowed(a.address))) {
        return { ok: false, failure: "blocked", reason: "private-address" };
    }
    const first = addresses[0];
    return {
        ok: true,
        pinned: {
            address: bare(first.address),
            family: first.family === 6 ? 6 : 4,
        },
    };
}

type LookupCallback = (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
) => void;

/**
 * A `lookup` for `http.request` that answers with the checked address and
 * never asks DNS. The request keeps the host name, so TLS still checks the
 * certificate against it and the `Host` header is the site's; only where
 * the socket connects is fixed. Node asks for every address (`all: true`)
 * when it races IPv4 and IPv6, and for one otherwise: both get the same.
 */
export function pinnedLookup(pinned: PinnedAddress) {
    return (
        _hostname: string,
        options: unknown,
        callback?: LookupCallback,
    ): void => {
        const done = (
            typeof options === "function" ? options : callback
        ) as LookupCallback;
        const all =
            typeof options === "object" &&
            options !== null &&
            (options as { all?: boolean }).all === true;
        if (all) {
            done(null, [{ address: pinned.address, family: pinned.family }]);
        } else {
            done(null, pinned.address, pinned.family);
        }
    };
}
