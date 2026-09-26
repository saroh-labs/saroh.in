// DB-free unit tests for the server-side EntitlementService (S7-005). Only the
// BILLING delegates (subscription/plan) are mocked; the merchant payment
// delegates are mocked too and asserted NEVER-CALLED so entitlement resolution
// can be proven to stay on the billing side of the credential boundary.
jest.mock("@saroh/database", () => {
    const subscription = { findUnique: jest.fn() };
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
        plan: { id: "plan_1", entitlements },
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
        ).entitlementOverride.findMany.mockResolvedValueOnce([
            override("sites", 4),
        ]);

        await expect(service().getEntitlements("org_1")).resolves.toEqual({
            ...FREE_ENTITLEMENTS,
            sites: 4,
        });
    });
});
