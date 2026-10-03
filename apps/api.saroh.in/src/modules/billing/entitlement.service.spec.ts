// DB-free unit tests for the server-side EntitlementService (S7-005), read
// from the pricing catalogue (U12). Only the BILLING delegates (subscription,
// overrides, catalogue versions) are mocked; the merchant payment
// delegates are mocked too and asserted NEVER-CALLED so entitlement resolution
// can be proven to stay on the billing side of the credential boundary.
jest.mock("@saroh/database", () => {
    const subscription = { findUnique: jest.fn() };
    // A catalogue version by number (a catalogue subscriber's own, U12).
    const pricingCatalogVersion = { findUnique: jest.fn() };
    // No live overrides unless a test says otherwise.
    const entitlementOverride = { findMany: jest.fn(() => []) };
    // Merchant delegates — present so we can assert billing NEVER touches them.
    const merchantPaymentProvider = {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    };
    const paymentIntent = { findFirst: jest.fn(), findUnique: jest.fn() };
    const webhookEvent = { create: jest.fn() };
    // No scheduled checkout (U15): a due move is read as applied.
    const billingCheckout = { findFirst: jest.fn(() => null) };
    return {
        // The live catalogue version: none unless a test says otherwise.
        liveCatalogueVersion: jest.fn(() => null),
        // Every version's plans are at the billing provider (U15).
        unsyncedCatalogueVersions: jest.fn(() => []),
        prisma: {
            billingCheckout,
            subscription,
            pricingCatalogVersion,
            entitlementOverride,
            merchantPaymentProvider,
            paymentIntent,
            webhookEvent,
        },
    };
});

import { ForbiddenException } from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";

import {
    applyOverrides,
    EntitlementService,
    FREE_ENTITLEMENTS,
} from "./entitlement.service";

const subFindUnique = prisma.subscription.findUnique as jest.Mock;
const merchantFindUnique = (
    prisma as unknown as {
        merchantPaymentProvider: { findUnique: jest.Mock };
    }
).merchantPaymentProvider.findUnique;
const intentFindFirst = (
    prisma as unknown as { paymentIntent: { findFirst: jest.Mock } }
).paymentIntent.findFirst;

function service(): EntitlementService {
    return new EntitlementService();
}

/** A subscribed org whose plan grants the given entitlements. */
function subscribedWith(
    entitlements: Record<string, number | boolean>,
    status = "ACTIVE",
) {
    return {
        id: "sub_1",
        organizationId: "org_1",
        status,
        plan: { id: "plan_1", key: "custom", entitlements },
    };
}

beforeEach(() => jest.clearAllMocks());

describe("EntitlementService.getEntitlements", () => {
    it("returns the FREE default when the org has no subscription", async () => {
        subFindUnique.mockResolvedValue(null);

        const result = await service().getEntitlements("org_1");

        expect(result).toEqual(FREE_ENTITLEMENTS);
    });

    it("returns the plan's entitlements for a subscribed org", async () => {
        subFindUnique.mockResolvedValue(
            subscribedWith({ sites: 5, teamMembers: 10, customDomain: true }),
        );

        const result = await service().getEntitlements("org_1");

        expect(result).toEqual({
            sites: 5,
            teamMembers: 10,
            customDomain: true,
        });
    });

    it("falls back to FREE when the subscription is CANCELLED", async () => {
        subFindUnique.mockResolvedValue(
            subscribedWith({ sites: 99, customDomain: true }, "CANCELLED"),
        );

        const result = await service().getEntitlements("org_1");

        expect(result).toEqual(FREE_ENTITLEMENTS);
    });

    it("never reads a merchant payment delegate (credential separation)", async () => {
        subFindUnique.mockResolvedValue(null);

        await service().getEntitlements("org_1");

        expect(merchantFindUnique).not.toHaveBeenCalled();
        expect(intentFindFirst).not.toHaveBeenCalled();
    });
});

describe("EntitlementService.check", () => {
    it("allows adding one more when under the numeric limit", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ sites: 3 }));

        await expect(service().check("org_1", "sites", 2)).resolves.toBe(true);
    });

    it("denies (throws) when already AT the numeric limit", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ sites: 3 }));

        await expect(
            service().check("org_1", "sites", 3),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("denies (throws) when OVER the numeric limit", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ sites: 3 }));

        await expect(
            service().check("org_1", "sites", 4),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("treats a non-numeric / absent entitlement as no cap (allows)", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ customDomain: true }));

        await expect(service().check("org_1", "sites", 1_000)).resolves.toBe(
            true,
        );
    });

    it("enforces the FREE default cap for an unsubscribed org", async () => {
        subFindUnique.mockResolvedValue(null);

        // FREE grants 1 site: a second one is over-limit.
        await expect(
            service().check("org_1", "sites", 1),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("gives an unsubscribed business five storefronts (ADR-010)", async () => {
        subFindUnique.mockResolvedValue(null);

        expect(FREE_ENTITLEMENTS.storefronts).toBe(5);
        await expect(service().check("org_1", "storefronts", 4)).resolves.toBe(
            true,
        );
        await expect(
            service().check("org_1", "storefronts", 5),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("follows a plan's own storefronts number", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ storefronts: 2 }));

        await expect(service().check("org_1", "storefronts", 1)).resolves.toBe(
            true,
        );
        await expect(
            service().check("org_1", "storefronts", 2),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("EntitlementService.can", () => {
    it("reflects a true boolean entitlement", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ customDomain: true }));

        await expect(service().can("org_1", "customDomain")).resolves.toBe(
            true,
        );
    });

    it("is false for the FREE default (customDomain off) and absent keys", async () => {
        subFindUnique.mockResolvedValue(null);

        await expect(service().can("org_1", "customDomain")).resolves.toBe(
            false,
        );
        await expect(service().can("org_1", "ssoLogin")).resolves.toBe(false);
    });
});

describe("applyOverrides", () => {
    const override = (key: string, value: number) => ({
        id: `ovr_${key}`,
        key,
        value,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    it("raises a numeric cap the plan sets", () => {
        expect(applyOverrides({ sites: 1 }, [override("sites", 5)])).toEqual({
            sites: 5,
        });
    });

    it("never lowers a cap", () => {
        expect(applyOverrides({ sites: 10 }, [override("sites", 5)])).toEqual({
            sites: 10,
        });
    });

    it("never imposes a cap the plan leaves open, nor touches a feature", () => {
        expect(
            applyOverrides({ customDomain: false }, [
                override("sites", 5),
                override("customDomain", 1),
            ]),
        ).toEqual({ customDomain: false });
    });

    it("applies a live raise through getEntitlements", async () => {
        subFindUnique.mockResolvedValue(null);
        findMany.mockResolvedValue([raise("sites", 4)]);

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            ...FREE_ENTITLEMENTS,
            sites: 4,
        });
    });
});

// --- the catalogue (U12) ------------------------------------------------

const findMany = (
    prisma as unknown as { entitlementOverride: { findMany: jest.Mock } }
).entitlementOverride.findMany;
const versionFindUnique = (
    prisma as unknown as { pricingCatalogVersion: { findUnique: jest.Mock } }
).pricingCatalogVersion.findUnique;
const liveVersion = liveCatalogueVersion as jest.Mock;

const FAR = new Date("2099-01-01T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");

let rowSeq = 0;
/** A catalogue version row; each gets its own id, as the database's would. */
function versionRow(version: number, catalog: Catalog | object) {
    rowSeq += 1;
    return { id: `ver_${version}_${rowSeq}`, version, catalog };
}

function overrideRow(over: Record<string, unknown>) {
    return {
        id: `ovr_${String(over.kind)}_${String(over.planKey ?? over.key)}`,
        key: "plan",
        moduleKey: null,
        value: null,
        planKey: null,
        createdAt: new Date("2026-01-01"),
        expiresAt: FAR,
        revokedAt: null,
        ...over,
    };
}

const planOverride = (planKey: string, createdAt = "2026-01-01") =>
    overrideRow({
        id: `ovr_${planKey}_${createdAt}`,
        kind: "plan",
        planKey,
        createdAt: new Date(createdAt),
    });

function raise(key: string, value: number) {
    return overrideRow({ id: `raise_${key}`, kind: "raise", key, value });
}

/** A subscription row on a billing `Plan`, as `CatalogueAccessService` reads it. */
function onPlan(
    key: string,
    over: {
        version?: number;
        status?: string;
        priceCents?: number;
        entitlements?: Record<string, number | boolean>;
        pendingPlan?: { key: string; version: number } | null;
        pendingFrom?: Date | null;
        addons?: { addonId: string; quantity: number }[];
    } = {},
) {
    return {
        status: over.status ?? "ACTIVE",
        pendingFrom: over.pendingFrom ?? null,
        plan: {
            key,
            version: over.version ?? 1,
            priceCents: over.priceCents ?? 0,
            entitlements: over.entitlements ?? {},
        },
        pendingPlan: over.pendingPlan
            ? { ...over.pendingPlan, priceCents: 0, entitlements: {} }
            : null,
        addons: over.addons ?? [],
    };
}

describe("EntitlementService on the catalogue (U12)", () => {
    beforeEach(() => {
        findMany.mockReset().mockResolvedValue([]);
        versionFindUnique.mockReset().mockResolvedValue(null);
        liveVersion.mockReset().mockResolvedValue(null);
    });

    it("reads a catalogue subscriber's own version: every row, its legacy key and the unsold keys", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.grow", { version: 7 }));
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            website: true,
            products: 222,
            bookings: true,
            invoicing: true,
            members: 3,
            teamMembers: 3,
            sites: 1,
            storefronts: 5,
            customDomain: true,
        });
        expect(versionFindUnique).toHaveBeenCalledWith({
            where: { version: 7 },
        });
        expect(liveVersion).not.toHaveBeenCalled();
    });

    it("locks what Free leaves out, and gives it no custom domain", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.free", { version: 7 }));
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        const got = await service().getEntitlements("org_1");
        expect(got).toMatchObject({
            products: 11,
            invoicing: false,
            bookings: false,
            teamMembers: 1,
            customDomain: false,
        });
        await expect(service().can("org_1", "invoicing")).resolves.toBe(false);
        await expect(
            service().check("org_1", "products", 11),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("drops a key the row leaves uncapped, so check allows it", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.pro", { version: 7 }));
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        const got = await service().getEntitlements("org_1");
        expect(got.products).toBe(true);
        await expect(
            service().check("org_1", "products", 100_000),
        ).resolves.toBe(true);
    });

    it.each(["business", "pro"])(
        "reads a legacy %s subscriber as Grow on the live version, keeping its own row for the keys no row sells",
        async (key) => {
            subFindUnique.mockResolvedValue(
                onPlan(key, {
                    entitlements: {
                        sites: 41,
                        storefronts: 42,
                        customDomain: true,
                    },
                }),
            );
            liveVersion.mockResolvedValue(
                versionRow(3, fakeLegacyMappedCatalog()),
            );

            const got = await service().getEntitlements("org_1");
            expect(got).toMatchObject({
                sites: 41,
                storefronts: 42,
                customDomain: true,
                invoicing: true,
                products: 222,
            });
            expect(got).not.toEqual(FREE_ENTITLEMENTS);
        },
    );

    it("keeps a legacy key no catalogue plan maps on its own row, off the catalogue", async () => {
        subFindUnique.mockResolvedValue(
            onPlan("custom", { entitlements: { sites: 3 } }),
        );

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            sites: 3,
        });
        expect(liveVersion).not.toHaveBeenCalled();
    });

    it("puts a grandfathered business with no subscription on the override's plan", async () => {
        subFindUnique.mockResolvedValue(null);
        findMany.mockResolvedValue([planOverride("grow")]);
        liveVersion.mockResolvedValue(versionRow(3, fakeLegacyMappedCatalog()));

        const got = await service().getEntitlements("org_1");
        expect(got).toMatchObject({
            products: 222,
            invoicing: true,
            customDomain: true,
        });
        await expect(service().livePlanOverride("org_1")).resolves.toEqual({
            id: "ovr_grow_2026-01-01",
            planKey: "grow",
            expiresAt: FAR,
        });
    });

    it("lets a plan override win over the subscription, dropping the legacy row it no longer is", async () => {
        subFindUnique.mockResolvedValue(
            onPlan("business", {
                entitlements: { sites: 41, customDomain: true },
            }),
        );
        findMany.mockResolvedValue([planOverride("free")]);
        liveVersion.mockResolvedValue(versionRow(3, fakeLegacyMappedCatalog()));

        await expect(
            service().getPlanEntitlements("org_1"),
        ).resolves.toMatchObject({
            sites: 1,
            customDomain: false,
            invoicing: false,
            products: 11,
        });
    });

    it("ignores an override naming a plan the version doesn't have, never reading the business as Free", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.grow", { version: 7 }));
        findMany.mockResolvedValue([planOverride("gold")]);
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                products: 222,
                invoicing: true,
            },
        );
    });

    it("applies the newest of two live plan overrides", async () => {
        subFindUnique.mockResolvedValue(null);
        findMany.mockResolvedValue([
            planOverride("free", "2026-03-01"),
            planOverride("grow", "2026-01-01"),
        ]);
        liveVersion.mockResolvedValue(versionRow(3, fakeLegacyMappedCatalog()));

        await expect(
            service().getPlanEntitlements("org_1"),
        ).resolves.toMatchObject({
            invoicing: false,
        });
    });

    it("leaves an ended or revoked override out", async () => {
        subFindUnique.mockResolvedValue(null);
        findMany.mockResolvedValue([
            overrideRow({ kind: "plan", planKey: "grow", expiresAt: PAST }),
            overrideRow({
                id: "r",
                kind: "plan",
                planKey: "grow",
                revokedAt: PAST,
            }),
        ]);

        await expect(service().getEntitlements("org_1")).resolves.toEqual(
            FREE_ENTITLEMENTS,
        );
        expect(liveVersion).not.toHaveBeenCalled();
    });

    it("asks for every live override in one read: unrevoked, open-ended or not yet ended", async () => {
        subFindUnique.mockResolvedValue(null);

        await service().getEntitlements("org_1");

        const [[args]] = findMany.mock.calls as [
            [{ where: Record<string, unknown> }],
        ];
        expect(args.where).toEqual({
            organizationId: "org_1",
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        });
    });

    it("lets a raise lift a row and an unsold key, but not the plan values", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.grow", { version: 7 }));
        findMany.mockResolvedValue([raise("products", 333), raise("sites", 4)]);
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                products: 333,
                sites: 4,
            },
        );
        await expect(
            service().getPlanEntitlements("org_1"),
        ).resolves.toMatchObject({
            products: 222,
            sites: 1,
        });
    });

    it("applies grant, remove and set-limit overrides by row", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.free", { version: 7 }));
        findMany.mockResolvedValue([
            overrideRow({
                id: "g",
                kind: "grant",
                key: "invoicing",
                moduleKey: "invoicing",
            }),
            overrideRow({
                id: "x",
                kind: "remove",
                key: "website",
                moduleKey: "website",
            }),
            overrideRow({
                id: "l",
                kind: "limit",
                key: "members",
                moduleKey: "members",
                value: 2,
            }),
        ]);
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        await expect(
            service().getPlanEntitlements("org_1"),
        ).resolves.toMatchObject({
            invoicing: true,
            website: false,
            members: 2,
            teamMembers: 2,
        });
    });

    it("adds bought add-ons from the business's own version", async () => {
        subFindUnique.mockResolvedValue(
            onPlan("catalog.free", {
                version: 7,
                addons: [{ addonId: "things-pack", quantity: 2 }],
            }),
        );
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                products: 11 + 2 * 11,
            },
        );
    });

    it("follows a pending move once its date has passed, and not before", async () => {
        const catalogs: Record<number, Catalog> = {
            7: fakeLegacyMappedCatalog(),
            8: fakeLegacyMappedCatalog((c) => {
                c.modules.find((m) => m.id === "products")!.cells.free = {
                    inc: true,
                    text: "22",
                    card: "",
                    limit: 22,
                    per: "",
                };
            }),
        };
        versionFindUnique.mockImplementation(
            ({ where }: { where: { version: number } }) =>
                versionRow(where.version, catalogs[where.version]!),
        );

        subFindUnique.mockResolvedValue(
            onPlan("catalog.free", {
                version: 7,
                pendingPlan: { key: "catalog.free", version: 8 },
                pendingFrom: PAST,
            }),
        );
        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                products: 22,
            },
        );

        subFindUnique.mockResolvedValue(
            onPlan("catalog.free", {
                version: 7,
                pendingPlan: { key: "catalog.free", version: 8 },
                pendingFrom: FAR,
            }),
        );
        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                products: 11,
            },
        );
    });

    it("reads a cancelled catalogue subscriber as Free on the live version", async () => {
        subFindUnique.mockResolvedValue(
            onPlan("catalog.pro", { version: 7, status: "CANCELLED" }),
        );
        liveVersion.mockResolvedValue(versionRow(9, fakeLegacyMappedCatalog()));

        await expect(service().getEntitlements("org_1")).resolves.toMatchObject(
            {
                invoicing: false,
                products: 11,
            },
        );
    });

    it("fails safe to its own row when its version is missing or doesn't validate", async () => {
        subFindUnique.mockResolvedValue(
            onPlan("catalog.grow", {
                version: 7,
                priceCents: 22_200,
                entitlements: { products: 222, invoicing: true },
            }),
        );
        versionFindUnique.mockResolvedValue(null);
        const missing = await service().getEntitlements("org_1");
        expect(missing).toMatchObject({
            products: 222,
            invoicing: true,
            customDomain: true,
        });

        versionFindUnique.mockResolvedValue(versionRow(7, { plans: [] }));
        await expect(service().getEntitlements("org_1")).resolves.toEqual(
            missing,
        );
    });

    it("says which registry modules the plan includes", async () => {
        subFindUnique.mockResolvedValue(onPlan("catalog.free", { version: 7 }));
        versionFindUnique.mockResolvedValue(
            versionRow(7, fakeLegacyMappedCatalog()),
        );

        // Appointments' only row is locked on Free.
        await expect(
            service().moduleIncluded("org_1", "APPOINTMENTS"),
        ).resolves.toBe(false);
        // Commerce has a row on; CRM has none in the catalogue.
        await expect(
            service().moduleIncluded("org_1", "COMMERCE"),
        ).resolves.toBe(true);
        await expect(service().moduleIncluded("org_1", "CRM")).resolves.toBe(
            true,
        );

        // Off the catalogue, nothing is locked.
        subFindUnique.mockResolvedValue(null);
        await expect(
            service().moduleIncluded("org_1", "APPOINTMENTS"),
        ).resolves.toBe(true);
    });
});
