/**
 * ADR-006 — one storefront per business. Pure unit test with a mocked Prisma:
 * a business that already has a live storefront cannot create another, and the
 * refusal comes before the slug is even looked at.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        store: {
            count: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";

import { StoresService } from "./stores.service";

const storeCount = prisma.store.count as jest.Mock;
const storeFindUnique = prisma.store.findUnique as jest.Mock;
const storeCreate = prisma.store.create as jest.Mock;

describe("StoresService.createForUser — one storefront per business", () => {
    const service = new StoresService({} as FeatureFlagService);

    beforeEach(() => {
        jest.clearAllMocks();
        storeFindUnique.mockResolvedValue(null);
        storeCreate.mockResolvedValue({ id: "store_1" });
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

    it("refuses a second with a 409 and writes nothing", async () => {
        storeCount.mockResolvedValue(1);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Second" }),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                message: expect.stringMatching(/already has its storefront/),
            },
        });
        expect(storeFindUnique).not.toHaveBeenCalled();
        expect(storeCreate).not.toHaveBeenCalled();
    });

    it("still refuses a business that already has several", async () => {
        storeCount.mockResolvedValue(3);
        await expect(
            service.createForUser("user_1", "org_1", { name: "Fourth" }),
        ).rejects.toMatchObject({ status: 409 });
        expect(storeCreate).not.toHaveBeenCalled();
    });
});
