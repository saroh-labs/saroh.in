/**
 * ADR-010 — several storefronts, up to the product's ceiling. Pure unit test
 * with a mocked Prisma: the ceiling is checked first (409) and before
 * anything is written. A new storefront is online, 0 places customers visit
 * (owner, 8 Oct), so no plan is asked on create: the plan's locations are
 * asked when its kind becomes SHOP (`storefronts.spec.ts`).
 */
jest.mock("@saroh/database", () => ({
    isRlsEnforcementEnabled: () => false,
    currentOrgContext: () => undefined,
    outsideOrgContext: <T>(fn: () => T) => fn(),
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

import { planMeter } from "../billing/metering.service";
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
        // A plan key no catalogue plan maps: its own row decides (U12).
        plan: { key: "custom", entitlements },
    });

describe("StoresService.createForUser — storefronts up to the ceiling", () => {
    const service = new StoresService({} as FeatureFlagService);
    let enforcedRow: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        storeFindUnique.mockResolvedValue(null);
        storeCreate.mockResolvedValue({ id: "store_1" });
        subFindUnique.mockResolvedValue(null);
        overrides.mockResolvedValue([]);
        enforcedRow = jest.spyOn(planMeter, "enforcedRow");
    });
    afterEach(() => enforcedRow.mockRestore());

    it("creates the first storefront", async () => {
        storeCount.mockResolvedValue(0);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Hill Road" }),
        ).resolves.toEqual({ id: "store_1" });
        expect(storeCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
        });
    });

    it("never refuses an online storefront for the old floor, past what the plan allows", async () => {
        // The floor caps places customers visit; a new storefront is online.
        onPlan({ storefronts: 2 });
        storeCount.mockResolvedValue(7);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Eighth" }),
        ).resolves.toEqual({ id: "store_1" });
        expect(storeCreate).toHaveBeenCalledTimes(1);
        // Neither the plan nor the catalogue is asked on create.
        expect(subFindUnique).not.toHaveBeenCalled();
        expect(enforcedRow).not.toHaveBeenCalledWith("org_1", "locations");
    });

    it("never refuses one on a plan with no place customers visit", async () => {
        onPlan({ storefronts: 0 });
        storeCount.mockResolvedValue(0);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Online" }),
        ).resolves.toEqual({ id: "store_1" });
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
        expect(subFindUnique).not.toHaveBeenCalled();
        expect(storeCreate).not.toHaveBeenCalled();
    });

    it("counts only live storefronts against the ceiling: a closed one frees its place", async () => {
        storeCount.mockResolvedValue(MAX_STOREFRONTS_PER_BUSINESS - 1);
        await service.createForUser("user_1", "org_1", { name: "Again" });
        expect(storeCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
        });
        expect(storeCreate).toHaveBeenCalledTimes(1);
    });
});
