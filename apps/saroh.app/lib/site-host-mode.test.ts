import { describe, expect, it } from "vitest";

import type { SiteHostClass } from "./site-host-mode";
import { classifySiteHost, liveHostOf } from "./site-host-mode";

/**
 * The host classifier (DEC-071, KTD-7). The VECTOR below is shared: the API's
 * `apps/api.saroh.in/src/modules/sites/site-host-mode.spec.ts` (T3) pins the
 * same rows byte for byte, so the API and the renderer can never disagree
 * about whether a host is live or test.
 */

type Row = [host: string, root: string, expected: Omit<SiteHostClass, "host">];

// --- shared vector (keep identical to the renderer's) ---
const VECTOR: Row[] = [
    [
        "test--acme.saroh.app",
        "saroh.app",
        { mode: "test", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "test--acme.saroh.app.localhost",
        "saroh.app.localhost",
        { mode: "test", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "test.shop.acme.com",
        "saroh.app",
        { mode: "test", lookup: { by: "hostname", hostname: "shop.acme.com" } },
    ],
    [
        "acme.saroh.app",
        "saroh.app",
        { mode: "live", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "test.saroh.app",
        "saroh.app",
        { mode: "live", lookup: { by: "subdomain", subdomain: "test" } },
    ],
    [
        "a--b.saroh.app",
        "saroh.app",
        { mode: "live", lookup: { by: "subdomain", subdomain: "a--b" } },
    ],
    [
        "TEST--Acme.Saroh.App",
        "saroh.app",
        { mode: "test", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "test--acme.saroh.app.",
        "saroh.app",
        { mode: "test", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "test--acme.saroh.app.localhost:443",
        "saroh.app.localhost",
        { mode: "test", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "acme.saroh.app:3000",
        "saroh.app",
        { mode: "live", lookup: { by: "subdomain", subdomain: "acme" } },
    ],
    [
        "Test.Shop.Acme.Com.",
        "saroh.app",
        { mode: "test", lookup: { by: "hostname", hostname: "shop.acme.com" } },
    ],
    [
        "shop.acme.com",
        "saroh.app",
        { mode: "live", lookup: { by: "hostname", hostname: "shop.acme.com" } },
    ],
    [
        "test.acme.com",
        "saroh.app",
        { mode: "test", lookup: { by: "hostname", hostname: "acme.com" } },
    ],
    [
        "test.com",
        "saroh.app",
        { mode: "live", lookup: { by: "hostname", hostname: "test.com" } },
    ],
    ["test--acme.shop.com", "saroh.app", { mode: "test", lookup: null }],
    [
        "test--acme.saroh.app",
        "saroh.app.localhost",
        { mode: "test", lookup: null },
    ],
    ["test--a.b.saroh.app", "saroh.app", { mode: "test", lookup: null }],
    ["test--.saroh.app", "saroh.app", { mode: "test", lookup: null }],
    ["saroh.app", "saroh.app", { mode: "live", lookup: null }],
    ["www.saroh.app", "saroh.app", { mode: "live", lookup: null }],
    ["", "saroh.app", { mode: "live", lookup: null }],
];
// --- end shared vector ---

describe("classifySiteHost (KTD-7)", () => {
    it.each(VECTOR)("%s under %s", (host, root, expected) => {
        const got = classifySiteHost(host, root);
        expect({ mode: got.mode, lookup: got.lookup }).toEqual(expected);
    });

    it("returns the host as compared", () => {
        expect(
            classifySiteHost(" Test--Acme.Saroh.App.:443 ", "saroh.app").host,
        ).toBe("test--acme.saroh.app");
    });

    it("never names a live site for a label that starts with test--, whatever the root", () => {
        for (const root of [
            "saroh.app",
            "saroh.app.localhost",
            "",
            "other.example",
        ]) {
            for (const host of [
                "test--northwind.saroh.app",
                "test--northwind.saroh.app.localhost",
                "test--northwind.example.com",
            ]) {
                expect(classifySiteHost(host, root).mode).toBe("test");
            }
        }
    });

    it("pins the same vector as the API's spec, byte for byte", async () => {
        const { readFileSync } = await import("node:fs");
        const path = await import("node:path");
        const between = (source: string) => {
            const start = source.indexOf("// --- shared vector");
            const end = source.indexOf("// --- end shared vector ---");
            return source.slice(source.indexOf("\n", start), end);
        };
        const mine = readFileSync(__filename, "utf8");
        const theirs = readFileSync(
            path.resolve(
                __dirname,
                "../../api.saroh.in/src/modules/sites/site-host-mode.spec.ts",
            ),
            "utf8",
        );
        expect(between(mine)).toBe(between(theirs));
    });
});

describe("liveHostOf (UX-081)", () => {
    it("names the live site a test host stands beside", () => {
        expect(liveHostOf("test--acme.saroh.app", "saroh.app")).toBe(
            "acme.saroh.app",
        );
        expect(liveHostOf("test.shop.acme.com", "saroh.app")).toBe(
            "shop.acme.com",
        );
    });

    it("names nothing for a live host or a test host without a site", () => {
        expect(liveHostOf("acme.saroh.app", "saroh.app")).toBeNull();
        expect(liveHostOf("test--a.b.saroh.app", "saroh.app")).toBeNull();
    });
});
