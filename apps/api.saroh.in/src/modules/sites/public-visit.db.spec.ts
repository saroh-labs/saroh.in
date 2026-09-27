/**
 * The public visit read against a real Postgres (G8): which place a site may
 * show, the business-profile fallback, and that another business's store is
 * never served — by the app's filter, and by row-level security on its own
 * under a role that cannot bypass it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { PublicVisit } from "./public-visit.service";
import {
    PublicVisitService,
    publicWeek,
    registeredAddress,
} from "./public-visit.service";

const WEEK = [
    { day: "MON", open: "07:00", close: "19:00", closed: true },
    { day: "TUE", open: "07:00", close: "19:00", closed: false },
    { day: "WED", open: "07:00", close: "19:00", closed: false },
    { day: "THU", open: "07:00", close: "19:00", closed: false },
    { day: "FRI", open: "07:00", close: "19:00", closed: false },
    { day: "SAT", open: "07:00", close: "19:00", closed: false },
    { day: "SUN", open: "07:00", close: "19:00", closed: false },
];

// Generous: these tests read many times from one "visitor".
const visits = new PublicVisitService(new FixedWindowRateLimiter(1_000));

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

async function business(
    name: string,
    profile: Record<string, unknown> = {},
): Promise<{ organizationId: string; siteId: string }> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("g8-org") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, ...profile },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name, slug: uniq("g8-site") },
    });
    return { organizationId: org.id, siteId: site.id };
}

async function storefront(
    organizationId: string,
    name: string,
    settings: {
        kind: "SHOP" | "ONLINE";
        address?: string | null;
        openingHours?: unknown;
    },
    extra: { deletedAt?: Date; createdAt?: Date } = {},
): Promise<string> {
    const store = await prisma.store.create({
        data: {
            name,
            slug: uniq("g8-store"),
            organizationId,
            ...extra,
            settings: {
                create: {
                    kind: settings.kind,
                    address: settings.address ?? null,
                    openingHours:
                        settings.openingHours === undefined
                            ? undefined
                            : (settings.openingHours as object),
                },
            },
        },
    });
    return store.id;
}

async function expectNotFound(p: Promise<unknown>) {
    await expect(p).rejects.toBeInstanceOf(NotFoundException);
}

describe("public visit read (G8)", () => {
    let rye: { organizationId: string; siteId: string };
    let hillRoad: string;
    let online: string;
    let closed: string;
    let other: { organizationId: string; siteId: string };
    let otherShop: string;

    beforeAll(async () => {
        rye = await business("Rye & Co.", { timezone: "Asia/Kolkata" });
        // An online storefront first: the oldest store is not a place.
        online = await storefront(
            rye.organizationId,
            "Online",
            { kind: "ONLINE", openingHours: WEEK },
            { createdAt: new Date("2026-01-01T00:00:00Z") },
        );
        hillRoad = await storefront(
            rye.organizationId,
            "Hill Road",
            {
                kind: "SHOP",
                address: "22 Hill Road, Bandra West\nMumbai 400050",
                openingHours: WEEK,
            },
            { createdAt: new Date("2026-02-01T00:00:00Z") },
        );
        closed = await storefront(
            rye.organizationId,
            "Old counter",
            { kind: "SHOP", address: "1 Old Lane" },
            {
                createdAt: new Date("2025-12-01T00:00:00Z"),
                deletedAt: new Date(),
            },
        );
        other = await business("Pulse Fitness");
        otherShop = await storefront(other.organizationId, "Koramangala", {
            kind: "SHOP",
            address: "4th Block, Koramangala",
            openingHours: WEEK,
        });
    });

    it("serves a shop's address, hours and the business's zone", async () => {
        const visit = await visits.read(rye.siteId, hillRoad, "visitor");
        expect(visit).toEqual<PublicVisit>({
            source: "storefront",
            storeId: hillRoad,
            name: "Hill Road",
            address: "22 Hill Road, Bandra West\nMumbai 400050",
            phone: null,
            hours: WEEK as PublicVisit["hours"],
            timezone: "Asia/Kolkata",
        });
    });

    it("carries only the allow-listed fields", async () => {
        const visit = await visits.read(rye.siteId, hillRoad, "visitor");
        expect(Object.keys(visit).sort()).toEqual(
            [
                "address",
                "hours",
                "name",
                "phone",
                "source",
                "storeId",
                "timezone",
            ].sort(),
        );
    });

    it("keeps India's zone when the business has set none", async () => {
        const visit = await visits.read(other.siteId, otherShop, "visitor");
        expect(visit.timezone).toBe("Asia/Kolkata");
    });

    it("is a 404 for another business's store, even through a real site", async () => {
        await expectNotFound(visits.read(rye.siteId, otherShop, "visitor"));
        await expectNotFound(visits.read(other.siteId, hillRoad, "visitor"));
    });

    it("is a 404 for a site that does not exist or was deleted", async () => {
        await expectNotFound(visits.read("no-such-site", hillRoad, "visitor"));
        const gone = await business("Gone");
        await prisma.site.update({
            where: { id: gone.siteId },
            data: { deletedAt: new Date() },
        });
        await expectNotFound(visits.read(gone.siteId, undefined, "visitor"));
    });

    it("never serves an online storefront or a closed shop", async () => {
        await expectNotFound(visits.read(rye.siteId, online, "visitor"));
        await expectNotFound(visits.read(rye.siteId, closed, "visitor"));
    });

    it("with no store named, serves the business's first open shop", async () => {
        const visit = await visits.read(rye.siteId, undefined, "visitor");
        expect(visit.source).toBe("storefront");
        expect(visit.storeId).toBe(hillRoad);
    });

    describe("a business with no shop (E6's fallback)", () => {
        it("gives the registered address and the business's hours", async () => {
            const clinic = await business("Kavi Dental", {
                timezone: "Asia/Kolkata",
                addressLine1: "12th Main, Indiranagar",
                addressLine2: "  ",
                city: "Bengaluru",
                postalCode: "560038",
            });
            await storefront(clinic.organizationId, "Kavi Dental", {
                kind: "ONLINE",
                openingHours: WEEK,
            });
            const visit = await visits.read(
                clinic.siteId,
                undefined,
                "visitor",
            );
            expect(visit).toEqual<PublicVisit>({
                source: "business",
                storeId: null,
                name: "Kavi Dental",
                address: "12th Main, Indiranagar\nBengaluru 560038",
                phone: null,
                hours: WEEK as PublicVisit["hours"],
                timezone: "Asia/Kolkata",
            });
        });

        it("says no hours, rather than guessing, with no storefront at all", async () => {
            const solo = await business("Solo Studio");
            const visit = await visits.read(solo.siteId, undefined, "visitor");
            expect(visit).toMatchObject({
                source: "business",
                address: null,
                hours: null,
            });
        });

        it("never swaps a named store for the fallback", async () => {
            const clinic = await business("Named Clinic");
            const onlineOnly = await storefront(
                clinic.organizationId,
                "Online",
                { kind: "ONLINE" },
            );
            await expectNotFound(
                visits.read(clinic.siteId, onlineOnly, "visitor"),
            );
        });
    });

    it("reads a malformed week as no hours saved", async () => {
        const odd = await business("Odd Hours");
        const shop = await storefront(odd.organizationId, "Shop", {
            kind: "SHOP",
            address: "1 Street",
            openingHours: [{ day: "MON", open: "9am", close: "5pm" }],
        });
        const visit = await visits.read(odd.siteId, shop, "visitor");
        expect(visit.hours).toBeNull();
        expect(visit.address).toBe("1 Street");
    });

    it("answers 429 past the visitor's limit", async () => {
        const tight = new PublicVisitService(new FixedWindowRateLimiter(2));
        await tight.read(rye.siteId, hillRoad, "busy");
        await tight.read(rye.siteId, hillRoad, "busy");
        const third = tight.read(rye.siteId, hillRoad, "busy");
        await expect(third).rejects.toBeInstanceOf(HttpException);
        await expect(
            tight.read(rye.siteId, hillRoad, "busy"),
        ).rejects.toMatchObject({ status: 429 });
        // Another visitor is unaffected.
        await expect(
            tight.read(rye.siteId, hillRoad, "someone-else"),
        ).resolves.toMatchObject({ storeId: hillRoad });
    });

    /**
     * Row-level security as its own guarantee. `db push` builds the test
     * schema without the migrations' policies, so this applies the Store and
     * StoreSettings `org_isolation` policies as the migrations write them, and
     * reads as a role WITHOUT BYPASSRLS (the test connection is a superuser,
     * which RLS never binds).
     */
    describe("with RLS enforcement on, as a role that cannot bypass it", () => {
        const ROLE = "saroh_g8_rls_probe";

        beforeAll(async () => {
            await prisma.$executeRawUnsafe(`DO $$ BEGIN
                CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
            await prisma.$executeRawUnsafe(
                `GRANT USAGE ON SCHEMA public TO ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY`,
            );
            await prisma.$executeRawUnsafe(
                `DROP POLICY IF EXISTS "org_isolation" ON "Store"`,
            );
            await prisma.$executeRawUnsafe(`CREATE POLICY "org_isolation" ON "Store"
                USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR "organizationId" = current_setting('app.current_organization_id', true))`);
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "StoreSettings" ENABLE ROW LEVEL SECURITY`,
            );
            await prisma.$executeRawUnsafe(
                `DROP POLICY IF EXISTS "org_isolation" ON "StoreSettings"`,
            );
            await prisma.$executeRawUnsafe(`CREATE POLICY "org_isolation" ON "StoreSettings"
                USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreSettings"."storeId"
                                  AND p."organizationId" = current_setting('app.current_organization_id', true)))`);
        });

        afterAll(async () => {
            for (const table of ["Store", "StoreSettings"]) {
                await prisma.$executeRawUnsafe(
                    `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                );
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
                );
            }
            await prisma.$executeRawUnsafe(
                `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `REVOKE USAGE ON SCHEMA public FROM ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
        });

        /** Run `fn` in one transaction as the probe role, in `orgId`'s context. */
        async function asProbe<T>(
            orgId: string,
            fn: () => Promise<T>,
        ): Promise<T> {
            const before = process.env.RLS_ENFORCEMENT;
            // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
            process.env.RLS_ENFORCEMENT = "on";
            try {
                // The proxy opens the transaction, sets the organization and
                // runs every prisma call inside `fn` on it.
                return await runInOrgContext(orgId, () =>
                    prisma.$transaction(async (tx) => {
                        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
                        return fn();
                    }),
                );
            } finally {
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                if (before === undefined) delete process.env.RLS_ENFORCEMENT;
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                else process.env.RLS_ENFORCEMENT = before;
            }
        }

        it("serves site A's own shop", async () => {
            const visit = await asProbe(rye.organizationId, () =>
                visits.read(rye.siteId, hillRoad, "visitor"),
            );
            expect(visit.storeId).toBe(hillRoad);
            expect(visit.hours).toEqual(WEEK);
        });

        it("hides another business's stores with no app filter at all", async () => {
            const seen = await asProbe(rye.organizationId, async () => ({
                stores: await prisma.store.findMany({ select: { id: true } }),
                settings: await prisma.storeSettings.findMany({
                    select: { storeId: true },
                }),
            }));
            const storeIds = seen.stores.map((s) => s.id);
            expect(storeIds).toContain(hillRoad);
            expect(storeIds).not.toContain(otherShop);
            expect(seen.settings.map((s) => s.storeId)).not.toContain(
                otherShop,
            );
        });

        it("refuses site B's store in site A's context, where the app filter alone would admit it", async () => {
            // The service's own filter names site B's business, so only RLS
            // (bound to Rye) stands between this read and Pulse's shop.
            await expectNotFound(
                asProbe(rye.organizationId, () =>
                    visits.read(other.siteId, otherShop, "visitor"),
                ),
            );
        });
    });
});

describe("publicWeek and registeredAddress", () => {
    it("keeps a well-formed week and refuses anything else", () => {
        expect(publicWeek(WEEK)).toEqual(WEEK);
        expect(publicWeek([])).toBeNull();
        expect(publicWeek(null)).toBeNull();
        expect(publicWeek({ MON: "9-5" })).toBeNull();
        expect(
            publicWeek([
                { day: "MON", open: "24:00", close: "25:00", closed: false },
            ]),
        ).toBeNull();
        // Extra keys never ride along.
        expect(
            publicWeek([
                {
                    day: "MON",
                    open: "09:00",
                    close: "17:00",
                    closed: false,
                    note: "staff only",
                },
            ]),
        ).toEqual([
            { day: "MON", open: "09:00", close: "17:00", closed: false },
        ]);
    });

    it("writes the registered address as lines, leaving out blanks", () => {
        expect(
            registeredAddress({
                addressLine1: "12th Main",
                addressLine2: null,
                city: "Bengaluru",
                postalCode: null,
            }),
        ).toBe("12th Main\nBengaluru");
        expect(
            registeredAddress({
                addressLine1: null,
                addressLine2: " ",
                city: null,
                postalCode: null,
            }),
        ).toBeNull();
    });
});
