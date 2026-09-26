/**
 * ADR-010 — several storefronts, up to the plan. Pure unit test with a mocked
 * Prisma: the product's ceiling is checked first (409), the plan's
 * `storefronts` entitlement second (403), and both refusals come before the
 * slug is even looked at.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        store: {
            count: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
        },
        order: { findFirst: jest.fn().mockResolvedValue(null) },
        product: { findFirst: jest.fn().mockResolvedValue(null) },
        subscription: { findUnique: jest.fn() },
        entitlementOverride: { findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { EntitlementService } from "../billing/entitlement.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { MAX_STOREFRONTS_PER_BUSINESS } from "../organizations/business-limits";

import { StoresService } from "./stores.service";

const storeCount = prisma.store.count as jest.Mock;
const storeFindUnique = prisma.store.findUnique as jest.Mock;
const storeCreate = prisma.store.create as jest.Mock;
const subFindUnique = prisma.subscription.findUnique as jest.Mock;
const overrides = prisma.entitlementOverride.findMany as jest.Mock;

/** A business on a plan that grants these limits. */
const onPlan = (entitlements: Record<string, number | boolean>) =>
    subFindUnique.mockResolvedValue({
        status: "ACTIVE",
        plan: { entitlements },
    });

describe("StoresService.createForUser — storefronts up to the plan", () => {
    const service = new StoresService(
        {} as FeatureFlagService,
        new EntitlementService(),
    );

    beforeEach(() => {
        jest.clearAllMocks();
        storeFindUnique.mockResolvedValue(null);
        storeCreate.mockResolvedValue({ id: "store_1" });
        subFindUnique.mockResolvedValue(null);
        overrides.mockResolvedValue([]);
    });

    it("creates the first storefront", async () => {
        storeCount.mockResolvedValue(0);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Hill Road" }),
        ).resolves.toEqual({ id: "store_1" });
        expect(storeCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
        });
    });

    it("creates a second on a plan allowing 5", async () => {
        onPlan({ storefronts: 5 });
        storeCount.mockResolvedValue(1);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Online" }),
        ).resolves.toEqual({ id: "store_1" });
        expect(storeCreate).toHaveBeenCalledTimes(1);
    });

    it("lets a business with no plan have five (the free floor)", async () => {
        storeCount.mockResolvedValue(4);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Fifth" }),
        ).resolves.toEqual({ id: "store_1" });

        storeCount.mockResolvedValue(5);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Sixth" }),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("refuses one past the plan with a 403 in plain words, and writes nothing", async () => {
        onPlan({ storefronts: 2 });
        storeCount.mockResolvedValue(2);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Third" }),
        ).rejects.toMatchObject({
            status: 403,
            response: {
                message:
                    "Your plan includes 2 storefronts. A bigger plan adds more.",
            },
        });
        expect(storeFindUnique).not.toHaveBeenCalled();
        expect(storeCreate).not.toHaveBeenCalled();
    });

    it("refuses one past the product's ceiling with a 409, whatever the plan says", async () => {
        onPlan({ storefronts: 1_000 });
        storeCount.mockResolvedValue(MAX_STOREFRONTS_PER_BUSINESS);
        await expect(
            service.createForUser("user_1", "org_1", { name: "One more" }),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                message: expect.stringMatching(/as many as Saroh allows/),
            },
        });
        // The ceiling is checked before the plan is read.
        expect(subFindUnique).not.toHaveBeenCalled();
        expect(storeCreate).not.toHaveBeenCalled();
    });

    it("counts only live storefronts: a closed one frees its place", async () => {
        onPlan({ storefronts: 2 });
        storeCount.mockResolvedValue(1);
        await service.createForUser("user_1", "org_1", { name: "Again" });
        expect(storeCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
        });
        expect(storeCreate).toHaveBeenCalledTimes(1);
    });
});
