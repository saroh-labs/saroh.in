// What a public rate limit counts a caller by: one IPv4 address, or one
// IPv6 /64 — the block a single subscriber can rotate through.
import { createHash } from "node:crypto";

import { hashClientIp, limitAddress } from "./client-ip";

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

    it("hashes IPv4 as before, and never returns the raw address", () => {
        expect(hashClientIp("203.0.113.7")).toBe(
            createHash("sha256").update("203.0.113.7").digest("hex"),
        );
        expect(hashClientIp("::ffff:203.0.113.7")).toBe(
            hashClientIp("203.0.113.7"),
        );
        expect(hashClientIp(undefined)).toBeUndefined();
        expect(hashClientIp("")).toBeUndefined();
    });
});
