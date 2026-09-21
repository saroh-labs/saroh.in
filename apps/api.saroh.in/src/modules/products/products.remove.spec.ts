// Deleting a product that has been ordered is refused with a sentence, not a
// foreign-key 500. DB-free: Prisma is mocked.
jest.mock("@saroh/database", () => ({
    prisma: {
        product: { findFirst: jest.fn(), delete: jest.fn() },
        orderItem: { count: jest.fn() },
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { StoresService } from "../stores/stores.service";
import { ProductsService } from "./products.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const service = new ProductsService({
    writableOrganization: jest
        .fn()
        .mockResolvedValue({ organizationId: "org_1" }),
} as unknown as StoresService);

beforeEach(() => {
    jest.clearAllMocks();
    db.product!.findFirst!.mockResolvedValue({ id: "p_1" });
});

describe("ProductsService.remove", () => {
    it("refuses a product that has been ordered, and deletes nothing", async () => {
        db.orderItem!.count!.mockResolvedValue(3);
        await expect(service.remove("st_1", "p_1", "u_1")).rejects.toThrow(
            ConflictException,
        );
        await expect(service.remove("st_1", "p_1", "u_1")).rejects.toThrow(
            /Archive it instead/,
        );
        expect(db.product!.delete).not.toHaveBeenCalled();
    });

    it("deletes a product nobody has ordered", async () => {
        db.orderItem!.count!.mockResolvedValue(0);
        await expect(service.remove("st_1", "p_1", "u_1")).resolves.toEqual({
            id: "p_1",
        });
        expect(db.product!.delete).toHaveBeenCalledWith({
            where: { id: "p_1" },
        });
    });
});
