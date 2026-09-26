// Deleting a product that has been ordered, or whose stock was counted or
// moved, is refused with a sentence, not a foreign-key 500 or a cascade that
// erases the stock log. DB-free: Prisma is mocked.
jest.mock("@saroh/database", () => {
    const client = {
        product: { findFirst: jest.fn(), delete: jest.fn() },
        orderItem: { count: jest.fn() },
        stockEntry: { count: jest.fn() },
        stockLevel: { count: jest.fn() },
        productListing: {
            findUnique: jest.fn().mockResolvedValue({ id: "l_1" }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
        $transaction: jest.fn(),
    };
    client.$transaction.mockImplementation(
        (fn: (tx: typeof client) => unknown) => fn(client),
    );
    return { prisma: client };
});

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
    db.orderItem!.count!.mockResolvedValue(0);
    db.stockEntry!.count!.mockResolvedValue(0);
    db.stockLevel!.count!.mockResolvedValue(0);
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

    it("refuses a product with stock entries, pointing to Not sold", async () => {
        db.stockEntry!.count!.mockResolvedValue(1);
        await expect(service.remove("st_1", "p_1", "u_1")).rejects.toThrow(
            /stock history.*Set it to Not sold instead/,
        );
        expect(db.product!.delete).not.toHaveBeenCalled();
    });

    it("refuses a product with units on a shelf", async () => {
        db.stockLevel!.count!.mockResolvedValue(1);
        await expect(service.remove("st_1", "p_1", "u_1")).rejects.toThrow(
            ConflictException,
        );
        expect(db.stockLevel!.count).toHaveBeenCalledWith({
            where: { productId: "p_1", onHand: { not: 0 } },
        });
        expect(db.product!.delete).not.toHaveBeenCalled();
    });

    it("deletes a product nobody has ordered or counted", async () => {
        await expect(service.remove("st_1", "p_1", "u_1")).resolves.toEqual({
            id: "p_1",
        });
        expect(db.product!.delete).toHaveBeenCalledWith({
            where: { id: "p_1" },
        });
    });
});
