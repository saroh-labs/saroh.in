/**
 * The host classifier (DEC-071, KTD-7). The VECTOR below is shared: the
 * renderer's `apps/saroh.app/lib/site-host-mode.test.ts` (T5) pins the same
 * rows byte for byte, so the API and the renderer can never disagree about
 * whether a host is live or test.
 */
const findUnique = jest.fn();
jest.mock("@saroh/database", () => ({
    prisma: { domain: { findUnique: (...a: unknown[]) => findUnique(...a) } },
    outsideOrgContext: (fn: () => unknown) => fn(),
}));

import type { SiteHostClass } from "./site-host-mode";
import { classifySiteHost, siteHostMode, testHostsFor } from "./site-host-mode";

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
});

describe("siteHostMode", () => {
    beforeEach(() => findUnique.mockReset());

    it("keeps test.<H> as test when no Domain row claims the whole host", async () => {
        findUnique.mockResolvedValue(null);
        const got = await siteHostMode("test.shop.acme.com", "saroh.app");
        expect(got.mode).toBe("test");
        expect(findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { hostname: "test.shop.acme.com" },
            }),
        );
    });

    it("serves an exact VERIFIED claim on test.<H> as that site's live host", async () => {
        findUnique.mockResolvedValue({ status: "VERIFIED", siteId: "site_1" });
        expect(await siteHostMode("test.shop.acme.com", "saroh.app")).toEqual({
            host: "test.shop.acme.com",
            mode: "live",
            lookup: { by: "hostname", hostname: "test.shop.acme.com" },
        });
    });

    it("does not let a PENDING or unbound claim turn a test host live", async () => {
        for (const row of [
            { status: "PENDING", siteId: "site_1" },
            { status: "VERIFIED", siteId: null },
        ]) {
            findUnique.mockResolvedValue(row);
            expect(
                (await siteHostMode("test.shop.acme.com", "saroh.app")).mode,
            ).toBe("test");
        }
    });

    it("never asks the database about a platform host", async () => {
        expect(
            (await siteHostMode("test--acme.saroh.app", "saroh.app")).mode,
        ).toBe("test");
        expect((await siteHostMode("acme.saroh.app", "saroh.app")).mode).toBe(
            "live",
        );
        expect(findUnique).not.toHaveBeenCalled();
    });
});

describe("testHostsFor", () => {
    it("gives the platform test host, then each custom one", () => {
        expect(
            testHostsFor(
                { subdomain: "northwind", customHostnames: ["Shop.Acme.com"] },
                "saroh.app",
            ),
        ).toEqual([
            { host: "test--northwind.saroh.app", kind: "platform" },
            { host: "test.shop.acme.com", kind: "custom" },
        ]);
    });

    it("gives no platform host when test-- would not fit one DNS label", () => {
        expect(
            testHostsFor({ subdomain: "a".repeat(57) }, "saroh.app"),
        ).toHaveLength(1);
        expect(
            testHostsFor({ subdomain: "a".repeat(58) }, "saroh.app"),
        ).toEqual([]);
    });

    it("gives nothing for a site with no address and no custom domain", () => {
        expect(testHostsFor({ subdomain: null }, "saroh.app")).toEqual([]);
    });

    it("every host it gives classifies as that site's test host", () => {
        for (const { host } of testHostsFor(
            {
                subdomain: "northwind",
                customHostnames: ["acme.com", "shop.acme.com"],
            },
            "saroh.app.localhost",
        )) {
            expect(classifySiteHost(host, "saroh.app.localhost").mode).toBe(
                "test",
            );
        }
    });

    it("skips a custom hostname whose test host would not name it", () => {
        // `test.com` → `test.test.com` names `test.com`, fine; a bare label
        // like `localhost` would give `test.localhost`, which names nothing.
        expect(
            testHostsFor(
                { subdomain: null, customHostnames: ["localhost"] },
                "saroh.app",
            ),
        ).toEqual([]);
    });
});
