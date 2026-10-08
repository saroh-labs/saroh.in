import { describe, expect, it } from "vitest";

import { isPlatformAddress, verificationMetadata } from "./site-verification";

const ALL = [
    { service: "google" as const, code: "abcDEF123_-ghiJKL456mnoPQR" },
    { service: "bing" as const, code: "0123456789ABCDEF0123456789ABCDEF" },
    { service: "meta" as const, code: "abcdefghij0123456789klmnopqrst" },
    { service: "pinterest" as const, code: "0123456789abcdef0123456789abcdef" },
];

describe("verificationMetadata (DEC-108)", () => {
    it("draws every service's tag on a merchant's own domain", () => {
        expect(verificationMetadata(ALL, false)).toEqual({
            google: "abcDEF123_-ghiJKL456mnoPQR",
            other: {
                "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF",
                "facebook-domain-verification":
                    "abcdefghij0123456789klmnopqrst",
                "p:domain_verify": "0123456789abcdef0123456789abcdef",
            },
        });
    });

    it("leaves Meta and Pinterest off a Saroh address", () => {
        expect(verificationMetadata(ALL, true)).toEqual({
            google: "abcDEF123_-ghiJKL456mnoPQR",
            other: { "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF" },
        });
    });

    it("draws nothing without codes, never an empty tag", () => {
        expect(verificationMetadata([], false)).toBeUndefined();
        expect(verificationMetadata([ALL[2]], true)).toBeUndefined();
    });
});

describe("isPlatformAddress", () => {
    it("tells a Saroh address from a merchant's own", () => {
        expect(isPlatformAddress("rye.saroh.app", "saroh.app")).toBe(true);
        expect(isPlatformAddress("Rye.Saroh.App", "saroh.app")).toBe(true);
        expect(isPlatformAddress("shop.rye.in", "saroh.app")).toBe(false);
        expect(isPlatformAddress("notsaroh.app", "saroh.app")).toBe(false);
    });
});
