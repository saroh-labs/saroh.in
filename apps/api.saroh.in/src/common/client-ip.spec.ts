// What a public rate limit counts a caller by: one IPv4 address, or one
// IPv6 /64 — the block a single subscriber can rotate through.
import { createHash } from "node:crypto";

import { hashClientIp, limitAddress, visitorAddress } from "./client-ip";

describe("limitAddress", () => {
    it("keeps an IPv4 address as it is", () => {
        expect(limitAddress("203.0.113.7")).toBe("203.0.113.7");
    });

    it("reads an IPv4-mapped IPv6 address as its IPv4", () => {
        expect(limitAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
        expect(limitAddress("::FFFF:203.0.113.7")).toBe("203.0.113.7");
    });

    it("counts IPv6 by its /64, however it is written", () => {
        expect(limitAddress("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(
            "2001:db8:1:2::/64",
        );
        expect(limitAddress("2001:0DB8:0001:0002::1")).toBe(
            "2001:db8:1:2::/64",
        );
        expect(limitAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
        expect(limitAddress("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
        expect(limitAddress("64:ff9b::192.0.2.33")).toBe("64:ff9b:0:0::/64");
    });

    it("passes anything that is not an address through", () => {
        expect(limitAddress("unknown")).toBe("unknown");
    });
});

describe("hashClientIp", () => {
    it("gives two addresses in one /64 the same key", () => {
        expect(hashClientIp("2001:db8:1:2::1")).toBe(
            hashClientIp("2001:db8:1:2:ffff:ffff:ffff:fffe"),
        );
    });

    it("gives another /64 its own key", () => {
        expect(hashClientIp("2001:db8:1:2::1")).not.toBe(
            hashClientIp("2001:db8:1:3::1"),
        );
    });

    it("never returns the raw address, nor a plain hash anyone can reverse", () => {
        expect(hashClientIp("203.0.113.7")).not.toContain("203.0.113.7");
        expect(hashClientIp("203.0.113.7")).not.toBe(
            createHash("sha256").update("203.0.113.7").digest("hex"),
        );
        // Without the server's secret, trying every address finds nothing.
        expect(hashClientIp("203.0.113.7", "another-secret")).not.toBe(
            hashClientIp("203.0.113.7"),
        );
        expect(hashClientIp("::ffff:203.0.113.7")).toBe(
            hashClientIp("203.0.113.7"),
        );
        expect(hashClientIp(undefined)).toBeUndefined();
        expect(hashClientIp("")).toBeUndefined();
    });
});

describe("visitorAddress (plan 2026-11-10-001, U6)", () => {
    const req = (peer: string, headers: Record<string, string> = {}) => ({
        headers,
        socket: { remoteAddress: peer },
    });

    it("takes CF-Connecting-IP from the tunnel or Cloudflare's edge", () => {
        const sent = { "cf-connecting-ip": "203.0.113.7" };
        expect(visitorAddress(req("10.0.1.14", sent), "cloudflare")).toBe(
            "203.0.113.7",
        );
        expect(
            visitorAddress(req("::ffff:172.68.1.1", sent), "cloudflare"),
        ).toBe("203.0.113.7");
        expect(visitorAddress(req("127.0.0.1", sent), "cloudflare")).toBe(
            "203.0.113.7",
        );
    });

    it("keeps the socket's address from anyone else, or without the Cloudflare mode", () => {
        const sent = { "cf-connecting-ip": "203.0.113.7" };
        expect(visitorAddress(req("198.51.100.4", sent), "cloudflare")).toBe(
            "198.51.100.4",
        );
        expect(visitorAddress(req("10.0.1.14", sent), "private")).toBe(
            "10.0.1.14",
        );
        expect(
            visitorAddress(
                req("10.0.1.14", { "cf-connecting-ip": "not an ip" }),
                "cloudflare",
            ),
        ).toBe("10.0.1.14");
    });

    it("never reads X-Forwarded-For", () => {
        expect(
            visitorAddress(
                req("198.51.100.4", { "x-forwarded-for": "192.0.2.1" }),
                "cloudflare",
            ),
        ).toBe("198.51.100.4");
    });
});
