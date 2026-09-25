// The business's categories (#529): every read and write is scoped to the
// organization it is handed, never to a storefront, and a category of
// another business is not found. The database is mocked; the behaviour
// against Postgres is in catalogue.service.spec.ts and
// catalogue.org-scope.db.spec.ts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            category: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            product: { findMany: jest.fn(), updateMany: jest.fn() },
            $transaction: jest.fn((ops: unknown) =>
                Array.isArray(ops) ? Promise.all(ops) : ops,
            ),
        },
    };
});

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CategoriesService } from "./categories.service";

const db = prisma as unknown as {
    category: Record<string, jest.Mock>;
    product: Record<string, jest.Mock>;
};

const ORG = "org_rye";

describe("CategoriesService (the business's categories)", () => {
    const categories = new CategoriesService();

    beforeEach(() => {
        jest.clearAllMocks();
        db.category.findMany.mockResolvedValue([]);
        db.category.findFirst.mockResolvedValue(null);
        db.category.findUnique.mockResolvedValue(null);
        db.category.create.mockResolvedValue({ id: "cat_new" });
        db.product.findMany.mockResolvedValue([]);
    });

    it("lists the business's categories, whatever storefront made them", async () => {
        await categories.list(ORG);
        expect(db.category.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: ORG } }),
        );
    });

    it("creates at the business, with no storefront, and checks the name and slug there", async () => {
        await categories.create(ORG, { name: "Breads" });
        expect(db.category.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: ORG }),
            }),
        );
        expect(db.category.findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_slug: { organizationId: ORG, slug: "breads" },
            },
        });
        const data = (
            db.category.create.mock.calls[0][0] as {
                data: Record<string, unknown>;
            }
        ).data;
        expect(data).toEqual({
            organizationId: ORG,
            name: "Breads",
            slug: "breads",
            parentId: null,
        });
        expect(data).not.toHaveProperty("storeId");
    });

    it("refuses a slug the business already has", async () => {
        db.category.findUnique.mockResolvedValue({ id: "cat_breads" });
        await expect(
            categories.create(ORG, { name: "Breads" }),
        ).rejects.toThrow(/slug is already taken/);
    });

    it("does not find another business's category to rename, merge or delete", async () => {
        // findFirst is asked for the id within this business; another
        // business's row never matches.
        await expect(
            categories.rename(ORG, "cat_elsewhere", { name: "Mine" }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            categories.merge(ORG, "cat_elsewhere", { intoId: null }),
        ).rejects.toThrow(NotFoundException);
        await expect(categories.remove(ORG, "cat_elsewhere")).rejects.toThrow(
            NotFoundException,
        );
        for (const [args] of db.category.findFirst.mock.calls as [
            { where: Record<string, unknown> },
        ][]) {
            expect(args.where).toMatchObject({ organizationId: ORG });
        }
        expect(db.category.delete).not.toHaveBeenCalled();
    });

    it("refuses a parent from another business", async () => {
        await expect(
            categories.create(ORG, { name: "Rolls", parentId: "cat_theirs" }),
        ).rejects.toThrow(/Unknown parent category/);
        expect(db.category.create).not.toHaveBeenCalled();
    });

    it("moves every storefront's products when a category goes", async () => {
        db.category.findFirst.mockResolvedValue({
            id: "cat_breads",
            name: "Breads",
            slug: "breads",
            parentId: null,
            _count: { children: 0, discountReach: 0 },
            fields: [],
            defaults: [],
        });
        db.product.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
        const removal = await categories.remove(ORG, "cat_breads");
        expect(removal.productIds).toEqual(["p1", "p2"]);
        expect(db.product.updateMany).toHaveBeenCalledWith({
            where: { categoryId: "cat_breads" },
            data: { categoryId: null },
        });
    });
});
