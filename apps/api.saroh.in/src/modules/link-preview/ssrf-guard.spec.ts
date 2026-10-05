import type { LookupAddress } from "node:dns";
import dns from "node:dns/promises";

import type { Transport, TransportRequest } from "./safe-fetch";
import { guardedFetch } from "./safe-fetch";
import type { Resolver } from "./ssrf-guard";
import {
    checkTarget,
    DNS_TIMEOUT_MS,
    isPublicAddress,
    mappedIpv4,
    MAX_URL_LENGTH,
    pinnedLookup,
    resolveTarget,
    systemResolver,
    testHostsFrom,
} from "./ssrf-guard";

/**
 * The link preview tool's SSRF guard (resources plan U2, KTD-3): the one
 * place a stranger's address is fetched, so every private, loopback,
 * link-local, CGNAT, metadata and reserved address is refused — for the
 * address typed, for what its host resolves to, and after every redirect —
 * and the connection goes to the address that was checked.
 */

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946";

const answers =
    (table: Record<string, string[]>): Resolver =>
    (host) => {
        const list = table[host];
        if (!list) return Promise.reject(new Error(`ENOTFOUND ${host}`));
        return Promise.resolve(
            list.map((address): LookupAddress => ({
                address,
                family: address.includes(":") ? 6 : 4,
            })),
        );
    };

describe("isPublicAddress", () => {
    it.each([
        ["127.0.0.1", "loopback"],
        ["127.255.0.9", "loopback"],
        ["10.0.0.1", "10/8"],
        ["10.255.255.255", "10/8"],
        ["172.16.0.1", "172.16/12"],
        ["172.31.255.255", "172.16/12"],
        ["192.168.1.1", "192.168/16"],
        ["169.254.169.254", "cloud metadata"],
        ["169.254.0.1", "link-local"],
        ["100.64.0.1", "CGNAT"],
        ["100.127.255.254", "CGNAT"],
        ["100.100.100.200", "Alibaba metadata, in CGNAT"],
        ["0.0.0.0", "unspecified"],
        ["0.1.2.3", "this network"],
        ["224.0.0.1", "multicast"],
        ["239.255.255.250", "multicast"],
        ["240.0.0.1", "reserved"],
        ["255.255.255.255", "broadcast"],
        ["192.0.2.10", "documentation"],
        ["198.18.0.1", "benchmarking"],
        ["::1", "IPv6 loopback"],
        ["::", "IPv6 unspecified"],
        ["fc00::1", "unique-local fc00::/7"],
        ["fd12:3456::1", "unique-local fc00::/7"],
        ["fd00:ec2::254", "AWS IPv6 metadata"],
        ["fe80::1", "link-local fe80::/10"],
        ["febf::1", "link-local fe80::/10"],
        ["ff02::1", "IPv6 multicast"],
        ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
        ["::ffff:7f00:1", "IPv4-mapped loopback, hex"],
        ["::ffff:10.0.0.1", "IPv4-mapped private"],
        ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
        ["64:ff9b::a00:1", "NAT64 of 10.0.0.1"],
        ["2002:7f00:1::", "6to4 of 127.0.0.1"],
        ["2001:db8::1", "documentation"],
        ["2001::1", "Teredo"],
        ["[::1]", "bracketed"],
        ["fe80::1%eth0", "with a zone"],
        ["not-an-ip", "not an address"],
    ])("refuses %s (%s)", (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });

    it.each([
        PUBLIC_V4,
        "8.8.8.8",
        "1.1.1.1",
        "172.32.0.1",
        "100.128.0.1",
        "192.169.0.1",
        PUBLIC_V6,
        "2a00:1450:4001:80b::200e",
        "::ffff:93.184.216.34",
    ])("lets %s through", (address) => {
        expect(isPublicAddress(address)).toBe(true);
    });

    it("reads both spellings of a mapped address", () => {
        expect(mappedIpv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
        expect(mappedIpv4("::ffff:7f00:1")).toBe("127.0.0.1");
        expect(mappedIpv4("0:0:0:0:0:ffff:a00:1")).toBe("10.0.0.1");
        expect(mappedIpv4(PUBLIC_V6)).toBeNull();
    });
});

describe("checkTarget", () => {
    const refused = (raw: string) => {
        const result = checkTarget(raw);
        return result.ok ? null : result;
    };

    it("adds https:// to an address typed without one, and drops the fragment", () => {
        const result = checkTarget("  example-bakery.in/menu#today ");
        expect(result.ok && result.url.href).toBe(
            "https://example-bakery.in/menu",
        );
    });

    it("takes http and https as typed", () => {
        const http = checkTarget("http://shop.example.com/");
        expect(http.ok && http.url.protocol).toBe("http:");
    });

    it.each([
        "ftp://example.com/",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,<p>hi</p>",
        "gopher://example.com/",
        "mailto:a@example.com",
    ])("refuses the scheme of %s", (raw) => {
        expect(refused(raw)).toMatchObject({
            failure: "invalid",
            reason: "scheme",
        });
    });

    it("refuses an address over the length cap", () => {
        const long = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;
        expect(refused(long)).toMatchObject({
            failure: "invalid",
            reason: "too-long",
        });
    });

    it("refuses an empty one, and a name and password in the address", () => {
        expect(refused("   ")).toMatchObject({ reason: "empty" });
        expect(refused("https://user:pass@example.com/")).toMatchObject({
            reason: "credentials",
        });
    });

    it("refuses an unusual port, but not the web's", () => {
        expect(refused("https://example.com:22/")).toMatchObject({
            reason: "port",
        });
        expect(refused("example.com:6379")).toMatchObject({ reason: "port" });
        expect(checkTarget("https://example.com:8443/").ok).toBe(true);
    });

    it.each([
        "http://127.0.0.1/",
        "http://10.1.2.3/",
        "http://172.16.0.5/",
        "http://192.168.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.1.1/",
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://[fc00::1]/",
        "http://[fe80::1]/",
        "http://[::ffff:127.0.0.1]/",
        // Spellings the URL parser turns into 127.0.0.1.
        "http://2130706433/",
        "http://0x7f.1/",
        "http://127.1/",
    ])("refuses the private address %s before any lookup", (raw) => {
        expect(refused(raw)).toMatchObject({
            failure: "blocked",
            reason: "private-address",
        });
    });

    it.each(["localhost", "printer.local", "db.internal", "intranet"])(
        "refuses the local name %s",
        (host) => {
            expect(refused(`http://${host}/`)).toMatchObject({
                failure: "blocked",
                reason: "local-name",
            });
        },
    );
});

describe("resolveTarget", () => {
    const url = (raw: string) => new URL(raw);

    it("pins the first address of a public host", async () => {
        const result = await resolveTarget(
            url("https://shop.example.com/"),
            answers({ "shop.example.com": [PUBLIC_V4, PUBLIC_V6] }),
        );
        expect(result).toEqual({
            ok: true,
            pinned: { address: PUBLIC_V4, family: 4 },
        });
    });

    it("refuses a public host that resolves to a private address", async () => {
        const result = await resolveTarget(
            url("https://evil.example.com/"),
            answers({ "evil.example.com": ["10.0.0.7"] }),
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
    });

    it("refuses a host with one public and one private address", async () => {
        const result = await resolveTarget(
            url("https://mixed.example.com/"),
            answers({ "mixed.example.com": [PUBLIC_V4, "169.254.169.254"] }),
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
    });

    it("refuses a host that resolves to a mapped loopback address", async () => {
        const result = await resolveTarget(
            url("https://mapped.example.com/"),
            answers({ "mapped.example.com": ["::ffff:127.0.0.1"] }),
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
    });

    it("says unreachable when the name doesn't resolve", async () => {
        const result = await resolveTarget(
            url("https://nowhere.example/"),
            answers({}),
        );
        expect(result).toMatchObject({
            ok: false,
            failure: "unreachable",
            reason: "dns",
        });
    });
});

describe("the test-only hosts", () => {
    it("let a named host reach loopback, and only loopback", async () => {
        const hosts = testHostsFrom("localhost, fixture.test", {
            nodeEnvs: ["test"],
        });
        expect(checkTarget("http://localhost:4123/page", hosts).ok).toBe(true);
        const loop = await resolveTarget(
            new URL("http://fixture.test:4123/"),
            answers({ "fixture.test": ["127.0.0.1"] }),
            hosts,
        );
        expect(loop.ok).toBe(true);
        const lan = await resolveTarget(
            new URL("http://fixture.test:4123/"),
            answers({ "fixture.test": ["192.168.1.10"] }),
            hosts,
        );
        expect(lan).toMatchObject({ ok: false, failure: "blocked" });
        // Not named: still refused.
        expect(checkTarget("http://127.0.0.1:4123/", hosts).ok).toBe(false);
    });

    it("are none in production, whatever is set", () => {
        const none = (run: Parameters<typeof testHostsFrom>[1]) =>
            testHostsFrom("localhost", run).size;
        expect(none({ nodeEnvs: ["production"] })).toBe(0);
        expect(none({ nodeEnvs: ["production"], ci: "true" })).toBe(0);
        expect(none({ nodeEnvs: [undefined, "production"] })).toBe(0);
        expect(testHostsFrom(undefined, { nodeEnvs: ["test"] }).size).toBe(0);
    });

    it("are honoured only in a test run: NODE_ENV=test, or CI set", () => {
        const count = (run: Parameters<typeof testHostsFrom>[1]) =>
            testHostsFrom("127.0.0.1", run).size;
        // A staging host that copied the variable gets nothing.
        expect(count({ nodeEnvs: ["development", "development"] })).toBe(0);
        expect(count({ nodeEnvs: [undefined, "development"] })).toBe(0);
        expect(count({ nodeEnvs: [undefined], ci: "false" })).toBe(0);
        expect(count({ nodeEnvs: ["test", "test"] })).toBe(1);
        // The browser-test stack: the built API with no NODE_ENV, CI set.
        expect(
            count({ nodeEnvs: [undefined, "development"], ci: "true" }),
        ).toBe(1);
        expect(count({ nodeEnvs: [undefined, "development"], ci: "1" })).toBe(
            1,
        );
    });
});

describe("resolving within the deadline", () => {
    it("answers timeout within ~1.5s when the name never resolves", async () => {
        const never: Resolver = () => new Promise(() => undefined);
        const started = Date.now();
        const result = await resolveTarget(
            new URL("https://slow-dns.example.com/"),
            never,
        );
        const took = Date.now() - started;
        expect(result).toEqual({
            ok: false,
            failure: "timeout",
            reason: "dns",
        });
        expect(took).toBeGreaterThanOrEqual(DNS_TIMEOUT_MS - 50);
        expect(took).toBeLessThan(DNS_TIMEOUT_MS + 500);
    });

    it("asks DNS directly (c-ares), never getaddrinfo on the thread pool", async () => {
        const v4 = jest
            .spyOn(dns.Resolver.prototype, "resolve4")
            .mockResolvedValue([PUBLIC_V4]);
        const v6 = jest
            .spyOn(dns.Resolver.prototype, "resolve6")
            .mockRejectedValue(
                Object.assign(new Error("no AAAA"), { code: "ENODATA" }),
            );
        const lookup = jest.spyOn(dns, "lookup");
        try {
            await expect(systemResolver("shop.example.com")).resolves.toEqual([
                { address: PUBLIC_V4, family: 4 },
            ]);
            expect(lookup).not.toHaveBeenCalled();

            // Neither family answered: the name is unreachable.
            v4.mockRejectedValueOnce(new Error("ETIMEOUT"));
            await expect(systemResolver("gone.example.com")).rejects.toThrow();
        } finally {
            v4.mockRestore();
            v6.mockRestore();
            lookup.mockRestore();
        }
    });
});

describe("pinnedLookup", () => {
    it("answers with the checked address in both of Node's shapes, without DNS", () => {
        const lookup = pinnedLookup({ address: PUBLIC_V4, family: 4 });
        const one = jest.fn();
        lookup("shop.example.com", { family: 0 }, one);
        expect(one).toHaveBeenCalledWith(null, PUBLIC_V4, 4);
        const all = jest.fn();
        lookup("shop.example.com", { all: true }, all);
        expect(all).toHaveBeenCalledWith(null, [
            { address: PUBLIC_V4, family: 4 },
        ]);
        const bare = jest.fn();
        lookup("shop.example.com", bare);
        expect(bare).toHaveBeenCalledWith(null, PUBLIC_V4, 4);
    });
});

describe("guardedFetch", () => {
    const options = { maxBytes: 1024, timeoutMs: 1_000, headers: {} };

    function transport(
        replies: Record<
            string,
            { status: number; location?: string; body?: string }
        >,
    ): Transport & { calls: TransportRequest[] } {
        const calls: TransportRequest[] = [];
        const fn = ((request: TransportRequest) => {
            calls.push(request);
            const reply = replies[request.url.href];
            if (!reply) return Promise.reject(new Error("ECONNREFUSED"));
            return Promise.resolve({
                status: reply.status,
                headers: reply.location ? { location: reply.location } : {},
                body: Buffer.from(reply.body ?? ""),
                truncated: false,
            });
        }) as Transport & { calls: TransportRequest[] };
        fn.calls = calls;
        return fn;
    }

    it("connects to the address it checked", async () => {
        const t = transport({
            "https://shop.example.com/": { status: 200, body: "ok" },
        });
        const result = await guardedFetch(
            new URL("https://shop.example.com/"),
            options,
            {
                resolve: answers({ "shop.example.com": [PUBLIC_V4] }),
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result.ok).toBe(true);
        expect(t.calls[0]?.pinned).toEqual({ address: PUBLIC_V4, family: 4 });
    });

    it("refuses a redirect to a private host, and never connects to it", async () => {
        const t = transport({
            "https://shop.example.com/": {
                status: 302,
                location: "http://169.254.169.254/latest/meta-data/",
            },
        });
        const result = await guardedFetch(
            new URL("https://shop.example.com/"),
            options,
            {
                resolve: answers({ "shop.example.com": [PUBLIC_V4] }),
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
        expect(t.calls).toHaveLength(1);
    });

    it("refuses a redirect to a public name that resolves private", async () => {
        const t = transport({
            "https://shop.example.com/": {
                status: 301,
                location: "https://inside.example.net/",
            },
        });
        const result = await guardedFetch(
            new URL("https://shop.example.com/"),
            options,
            {
                resolve: answers({
                    "shop.example.com": [PUBLIC_V4],
                    "inside.example.net": ["192.168.0.10"],
                }),
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
        expect(t.calls).toHaveLength(1);
    });

    it("refuses a redirect to another scheme", async () => {
        const t = transport({
            "https://shop.example.com/": {
                status: 302,
                location: "file:///etc/passwd",
            },
        });
        const result = await guardedFetch(
            new URL("https://shop.example.com/"),
            options,
            {
                resolve: answers({ "shop.example.com": [PUBLIC_V4] }),
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result).toMatchObject({
            ok: false,
            failure: "invalid",
            reason: "scheme",
        });
    });

    it("follows three redirects and gives up on the fourth", async () => {
        const hop = (n: number) => `https://shop.example.com/${n}`;
        const replies: Record<string, { status: number; location?: string }> =
            {};
        for (let i = 0; i < 5; i += 1)
            replies[hop(i)] = { status: 302, location: hop(i + 1) };
        const resolve = answers({ "shop.example.com": [PUBLIC_V4] });

        const four = transport(replies);
        const result = await guardedFetch(new URL(hop(0)), options, {
            resolve,
            transport: four,
            testHosts: new Set(),
        });
        expect(result).toMatchObject({
            ok: false,
            failure: "unreachable",
            reason: "redirects",
        });
        expect(four.calls).toHaveLength(4);

        const three = transport({ ...replies, [hop(3)]: { status: 200 } });
        const landed = await guardedFetch(new URL(hop(0)), options, {
            resolve,
            transport: three,
            testHosts: new Set(),
        });
        expect(landed.ok && landed.url.href).toBe(hop(3));
    });

    it("defeats DNS rebinding: one lookup per hop, and the connection uses that answer", async () => {
        // The attacker's name answers public first, private every time after.
        let asked = 0;
        const rebinding: Resolver = () => {
            asked += 1;
            const address = asked === 1 ? PUBLIC_V4 : "127.0.0.1";
            return Promise.resolve([{ address, family: 4 }]);
        };
        const t = transport({
            "https://rebind.example.com/": { status: 200, body: "page" },
        });
        const result = await guardedFetch(
            new URL("https://rebind.example.com/"),
            options,
            {
                resolve: rebinding,
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result.ok).toBe(true);
        expect(asked).toBe(1);
        expect(t.calls[0]?.pinned.address).toBe(PUBLIC_V4);

        // And the socket's own lookup can't ask again: it is pinned.
        const lookup = pinnedLookup(t.calls[0]!.pinned);
        const cb = jest.fn();
        lookup("rebind.example.com", {}, cb);
        expect(cb).toHaveBeenCalledWith(null, PUBLIC_V4, 4);
        expect(asked).toBe(1);
    });

    it("refuses a rebinding name whose second hop resolves private", async () => {
        let asked = 0;
        const rebinding: Resolver = () => {
            asked += 1;
            return Promise.resolve([
                { address: asked === 1 ? PUBLIC_V4 : "10.0.0.5", family: 4 },
            ]);
        };
        const t = transport({
            "https://rebind.example.com/": {
                status: 302,
                location: "https://rebind.example.com/again",
            },
        });
        const result = await guardedFetch(
            new URL("https://rebind.example.com/"),
            options,
            {
                resolve: rebinding,
                transport: t,
                testHosts: new Set(),
            },
        );
        expect(result).toMatchObject({ ok: false, failure: "blocked" });
        expect(t.calls).toHaveLength(1);
    });

    it("times out as a whole", async () => {
        const slow: Transport = () => new Promise(() => undefined);
        const result = await guardedFetch(
            new URL("https://slow.example.com/"),
            { ...options, timeoutMs: 20 },
            {
                resolve: answers({ "slow.example.com": [PUBLIC_V4] }),
                transport: slow,
                testHosts: new Set(),
            },
        );
        expect(result).toMatchObject({ ok: false, failure: "timeout" });
    });
});
