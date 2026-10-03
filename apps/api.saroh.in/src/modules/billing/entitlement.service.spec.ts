// DB-free unit tests for the server-side EntitlementService (S7-005). Only the
// BILLING delegates (subscription/plan) are mocked; the merchant payment
// delegates are mocked too and asserted NEVER-CALLED so entitlement resolution
// can be proven to stay on the billing side of the credential boundary.
jest.mock("@saroh/database", () => {
    const subscription = { findUnique: jest.fn() };
    // Legacy plan rows a `plan` override is read through (U5).
    const plan = { findFirst: jest.fn() };
    // No live overrides unless a test says otherwise.
    const entitlementOverride = { findMany: jest.fn(() => []) };
    // Merchant delegates — present so we can assert billing NEVER touches them.
    const merchantPaymentProvider = {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    };
    const paymentIntent = { findFirst: jest.fn(), findUnique: jest.fn() };
    const webhookEvent = { create: jest.fn() };
    return {
        prisma: {
            subscription,
            plan,
            entitlementOverride,
            merchantPaymentProvider,
            paymentIntent,
            webhookEvent,
        },
    };
});

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

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

    it("applies a live override through getEntitlements", async () => {
        (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
        (
            prisma as unknown as {
                entitlementOverride: { findMany: jest.Mock };
            }
        ).entitlementOverride.findMany.mockImplementation(
            // Raises only; no plan override (U5).
            ({ where }: { where: { kind: string } }) =>
                where.kind === "raise" ? [override("sites", 4)] : [],
        );

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            ...FREE_ENTITLEMENTS,
            sites: 4,
        });
    });
});

describe("a plan override (U5: grandfathering)", () => {
    const findMany = (
        prisma as unknown as {
            entitlementOverride: { findMany: jest.Mock };
        }
    ).entitlementOverride.findMany;
    const planFindFirst = (
        prisma as unknown as { plan: { findFirst: jest.Mock } }
    ).plan.findFirst;

    const GROW_ROW = { sites: 7, teamMembers: 9, customDomain: true };

    /** Serve `plan` rows to the plan query and `raise` rows to the other. */
    function overrides(plan: object[], raise: object[] = []) {
        findMany.mockImplementation(({ where }: { where: { kind: string } }) =>
            where.kind === "plan" ? plan : raise,
        );
    }

    const planOverride = (planKey: string, createdAt = "2026-01-01") => ({
        id: `ovr_${planKey}_${createdAt}`,
        key: "plan",
        planKey,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: new Date(createdAt),
    });

    afterEach(() => findMany.mockReset().mockImplementation(() => []));

    it("puts an unsubscribed business on Grow through the legacy rows that map to it", async () => {
        subFindUnique.mockResolvedValue(null);
        overrides([planOverride("grow")]);
        planFindFirst.mockResolvedValue({ entitlements: GROW_ROW });

        await expect(service().getEntitlements("org_1")).resolves.toEqual(
            GROW_ROW,
        );
        const [[args]] = planFindFirst.mock.calls as [
            [{ where: { key: { in: string[] } } }],
        ];
        expect(args.where.key.in.sort()).toEqual(["business", "pro"]);
    });

    it("wins over the subscription's own plan", async () => {
        subFindUnique.mockResolvedValue(
            subscribedWith({ ...FREE_ENTITLEMENTS, sites: 1 }),
        );
        overrides([planOverride("grow")]);
        planFindFirst.mockResolvedValue({ entitlements: GROW_ROW });

        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual(
            GROW_ROW,
        );
    });

    it("keeps a business's own row when its plan already maps to the override's", async () => {
        subFindUnique.mockResolvedValue({
            ...subscribedWith({ sites: 3, customDomain: true }),
            plan: {
                id: "plan_b",
                key: "business",
                entitlements: { sites: 3, customDomain: true },
            },
        });
        overrides([planOverride("grow")]);

        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual({
            sites: 3,
            customDomain: true,
        });
        expect(planFindFirst).not.toHaveBeenCalled();
    });

    it("reads a Free override as the free floor", async () => {
        subFindUnique.mockResolvedValue({
            ...subscribedWith({ sites: 3 }),
            plan: { id: "p", key: "business", entitlements: { sites: 3 } },
        });
        overrides([planOverride("free")]);

        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual(
            FREE_ENTITLEMENTS,
        );
    });

    it("ignores an override it can't read rather than reading the business as Free", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ sites: 3 }));
        overrides([planOverride("c")]);

        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual({
            sites: 3,
        });

        // A plan with legacy keys but no legacy row: the same.
        overrides([planOverride("grow")]);
        planFindFirst.mockResolvedValue(null);
        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual({
            sites: 3,
        });
    });

    it("applies the newest of two live plan overrides", async () => {
        subFindUnique.mockResolvedValue(subscribedWith({ sites: 3 }));
        overrides([
            planOverride("free", "2026-03-01"),
            planOverride("grow", "2026-01-01"),
        ]);

        await expect(service().getPlanEntitlements("org_1")).resolves.toEqual(
            FREE_ENTITLEMENTS,
        );
        await expect(service().livePlanOverride("org_1")).resolves.toEqual({
            id: "ovr_free_2026-03-01",
            planKey: "free",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        });
    });

    it("asks only for live plan overrides: unrevoked, open-ended or not yet ended", async () => {
        subFindUnique.mockResolvedValue(null);
        overrides([]);

        await service().getPlanEntitlements("org_1");

        const where = (
            findMany.mock.calls as [[{ where: Record<string, unknown> }]]
        )
            .map(([a]) => a.where)
            .find((w) => w.kind === "plan")!;
        expect(where).toMatchObject({
            organizationId: "org_1",
            revokedAt: null,
            planKey: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        });
    });

    it("lets a raise apply on top of the override's plan", async () => {
        subFindUnique.mockResolvedValue(null);
        overrides(
            [planOverride("grow")],
            [
                {
                    id: "r1",
                    key: "sites",
                    value: 12,
                    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
                },
            ],
        );
        planFindFirst.mockResolvedValue({ entitlements: GROW_ROW });

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            ...GROW_ROW,
            sites: 12,
        });
    });
});
