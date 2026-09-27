import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeEnv = vi.hoisted(() => ({
    NODE_ENV: "test",
    SITE_RELAY_SECRET: undefined as string | undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined as string | undefined,
}));
vi.mock("@/env", () => ({ env: fakeEnv }));

import {
    normaliseHost,
    relayFor,
    signSiteRelay,
    siteRelaySecret,
    visitorAddress,
} from "./site-relay";

/**
 * The relay header, built exactly as the API checks it (round-2 plan A, A3).
 * The vector below is also pinned in the API's `site-relay.spec.ts`: a change
 * on either side that the other doesn't make fails one of them.
 */
const DEV_SECRET = "saroh-dev-insecure-site-relay-secret-not-for-production";
const VECTOR =
    "v1.1790000000.MjAzLjAuMTEzLjc.a2F2aS5zYXJvaC5hcHA.gWBw2J0VLDl6pASl_GPNQIo-Uyh2iB9ORmVNYgUQykw";

beforeEach(() => {
    fakeEnv.NODE_ENV = "test";
    fakeEnv.SITE_RELAY_SECRET = undefined;
    fakeEnv.NEXT_PUBLIC_VERCEL_ENV = undefined;
});

describe("signSiteRelay", () => {
    it("signs the same header as the API's reference signer", () => {
        expect(
            signSiteRelay(
                {
                    address: "203.0.113.7",
                    host: "kavi.saroh.app",
                    now: 1_790_000_000_000,
                },
                DEV_SECRET,
            ),
        ).toBe(VECTOR);
    });

    it("signs the host as the API resolves it: lower-cased, no port", () => {
        expect(
            signSiteRelay(
                {
                    address: "203.0.113.7",
                    host: "Kavi.Saroh.App:443",
                    now: 1_790_000_000_000,
                },
                DEV_SECRET,
            ),
        ).toBe(VECTOR);
        expect(normaliseHost("kavi.saroh.app.")).toBe("kavi.saroh.app");
    });

    it("changes with the secret, the time, the address and the host", () => {
        const base = { address: "203.0.113.7", host: "kavi.saroh.app" };
        const at = 1_790_000_000_000;
        const sig = (h: string) => h.split(".")[4];
        const ref = sig(VECTOR);
        expect(sig(signSiteRelay({ ...base, now: at }, "another"))).not.toBe(
            ref,
        );
        expect(
            sig(signSiteRelay({ ...base, now: at + 1_000 }, DEV_SECRET)),
        ).not.toBe(ref);
        expect(
            sig(
                signSiteRelay(
                    { ...base, address: "203.0.113.8", now: at },
                    DEV_SECRET,
                ),
            ),
        ).not.toBe(ref);
        expect(
            sig(
                signSiteRelay(
                    { ...base, host: "pulse.saroh.app", now: at },
                    DEV_SECRET,
                ),
            ),
        ).not.toBe(ref);
    });
});

describe("siteRelaySecret", () => {
    it("uses the configured secret", () => {
        fakeEnv.SITE_RELAY_SECRET = "x".repeat(40);
        expect(siteRelaySecret()).toBe("x".repeat(40));
    });

    it("falls back to the API's dev value only in development and test", () => {
        expect(siteRelaySecret()).toBe(DEV_SECRET);
        fakeEnv.NODE_ENV = "development";
        expect(siteRelaySecret()).toBe(DEV_SECRET);
        fakeEnv.NODE_ENV = "production";
        expect(() => siteRelaySecret()).toThrow(/SITE_RELAY_SECRET/);
    });
});

describe("visitorAddress", () => {
    const h = (entries: Record<string, string>) => new Headers(entries);

    it("reads the platform's client address", () => {
        expect(visitorAddress(h({ "x-real-ip": "198.51.100.4" }))).toBe(
            "198.51.100.4",
        );
        expect(
            visitorAddress(
                h({ "x-forwarded-for": "198.51.100.5, 10.0.0.1, 10.0.0.2" }),
            ),
        ).toBe("198.51.100.5");
        expect(
            visitorAddress(h({ "x-forwarded-for": "[2001:db8::1]:443" })),
        ).toBe("2001:db8::1");
        expect(
            visitorAddress(h({ "x-forwarded-for": "198.51.100.6:5000" })),
        ).toBe("198.51.100.6");
    });

    it("prefers x-real-ip over x-forwarded-for", () => {
        expect(
            visitorAddress(
                h({
                    "x-real-ip": "198.51.100.4",
                    "x-forwarded-for": "10.9.9.9",
                }),
            ),
        ).toBe("198.51.100.4");
    });

    it("ignores anything that isn't an address", () => {
        fakeEnv.NEXT_PUBLIC_VERCEL_ENV = "production";
        expect(visitorAddress(h({ "x-forwarded-for": "evil.example" }))).toBe(
            null,
        );
    });

    it("stands in the loopback address off the platform, and only there", () => {
        expect(visitorAddress(h({}))).toBe("127.0.0.1");
        fakeEnv.NEXT_PUBLIC_VERCEL_ENV = "preview";
        expect(visitorAddress(h({}))).toBe(null);
    });
});

describe("relayFor", () => {
    it("makes no relay when the visitor's address is unknown", () => {
        fakeEnv.NEXT_PUBLIC_VERCEL_ENV = "production";
        expect(relayFor(new Headers(), "kavi.saroh.app")).toBe(null);
    });

    it("signs the visitor's address and the served host", () => {
        const header = relayFor(
            new Headers({ "x-real-ip": "203.0.113.7" }),
            "kavi.saroh.app",
        );
        if (!header) throw new Error("no relay");
        const [version, , address, host] = header.split(".");
        expect(version).toBe("v1");
        expect(Buffer.from(address, "base64url").toString()).toBe(
            "203.0.113.7",
        );
        expect(Buffer.from(host, "base64url").toString()).toBe(
            "kavi.saroh.app",
        );
    });
});
