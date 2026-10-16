jest.mock("@saroh/database", () => ({
    prisma: { productVariant: { findFirst: jest.fn() } },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { assertSkuFreeInBusiness, skuTakenMessage } from "./sku-holder";

/**
 * A SKU is one variant in the business (16 Oct 2026): another product's
 * variant can't take it, and the refusal names the holder on the SKU
 * field. Jest-mocked Prisma.
 */
describe("a SKU across the business", () => {
    const findFirst = prisma.productVariant.findFirst as unknown as jest.Mock;

    beforeEach(() => findFirst.mockReset());

    it("names the holder by product and variant", () => {
        expect(skuTakenMessage("PT-BRN", "Packing Tape", "Brown")).toBe(
            "PT-BRN is already Packing Tape · Brown.",
        );
        // A variant titled as its product (no option) is the product.
        expect(skuTakenMessage("PT-1", "Packing Tape", "Packing Tape")).toBe(
            "PT-1 is already Packing Tape.",
        );
    });

    it("refuses a SKU another product's variant has, on the SKU field", async () => {
        findFirst.mockResolvedValue({
            title: "Brown",
            product: { name: "Packing Tape" },
        });
        const err = await assertSkuFreeInBusiness(
            "org-1",
            "p2",
            " pt-brn ",
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message: "pt-brn is already Packing Tape · Brown.",
            field: "sku",
        });
        // Only other products of this business, letter case aside.
        expect(findFirst.mock.calls[0][0]).toMatchObject({
            where: {
                sku: { equals: "pt-brn", mode: "insensitive" },
                productId: { not: "p2" },
                product: { organizationId: "org-1" },
            },
        });
    });

    it("lets a free SKU through, and never asks about an empty one", async () => {
        findFirst.mockResolvedValue(null);
        await expect(
            assertSkuFreeInBusiness("org-1", "p2", "PT-NEW"),
        ).resolves.toBeUndefined();
        findFirst.mockClear();
        await expect(
            assertSkuFreeInBusiness("org-1", "p2", "  "),
        ).resolves.toBeUndefined();
        expect(findFirst).not.toHaveBeenCalled();
    });
});
