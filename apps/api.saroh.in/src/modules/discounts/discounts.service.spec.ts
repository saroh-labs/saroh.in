// Discount codes: what a create needs, whose targets may be named, and that
// reach is replaced as a whole. The database is mocked; the arithmetic of
// redemption has its own spec (redeem.spec.ts).
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        discount: { create: jest.fn(), update: jest.fn() },
        discountStore: { createMany: jest.fn(), deleteMany: jest.fn() },
        discountCategory: { createMany: jest.fn(), deleteMany: jest.fn() },
        discountProduct: { createMany: jest.fn(), deleteMany: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            discount: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
            },
            store: { count: jest.fn() },
            category: { count: jest.fn() },
            product: { count: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { DiscountsService } from "./discounts.service";
import { DiscountInputDto } from "./dto";

const db = prisma as unknown as {
    discount: Record<string, jest.Mock>;
    store: Record<string, jest.Mock>;
    category: Record<string, jest.Mock>;
    product: Record<string, jest.Mock>;
    __tx: Record<string, Record<string, jest.Mock>>;
};

const row = (over: Record<string, unknown> = {}) => ({
    id: "d_1",
    code: "MARKETDAY",
    description: null,
    kind: "PERCENTAGE",
    percentBps: 1500,
    amount: null,
    currency: null,
    appliesTo: "BUSINESS",
    startsAt: null,
    endsAt: null,
    usageLimit: 100,
    stores: [],
    categories: [],
    products: [],
    _count: { redemptions: 3 },
    ...over,
});

const service = new DiscountsService();

beforeEach(() => {
    jest.clearAllMocks();
    db.discount.findUnique!.mockResolvedValue(null);
    db.discount.findFirst!.mockResolvedValue(row());
    db.__tx.discount!.create!.mockResolvedValue({ id: "d_1" });
});

describe("create", () => {
    it("makes a business-wide percentage code with no reach rows", async () => {
        const view = await service.create("org_1", {
            code: "MARKETDAY",
            kind: "PERCENTAGE",
            percent: "15",
        });
        expect(db.__tx.discount!.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                code: "MARKETDAY",
                percentBps: 1500,
                appliesTo: "BUSINESS",
                amount: null,
                currency: null,
            }),
            select: { id: true },
        });
        expect(db.__tx.discountStore!.createMany).not.toHaveBeenCalled();
        expect(view).toMatchObject({ percent: "15", used: 3, state: "ACTIVE" });
    });

    it("writes one reach row per storefront, checked against this business", async () => {
        db.store.count!.mockResolvedValue(2);
        await service.create("org_1", {
            code: "HILLROAD",
            kind: "PERCENTAGE",
            percent: "10",
            appliesTo: "STOREFRONT",
            targetIds: ["st_1", "st_2"],
        });
        expect(db.store.count).toHaveBeenCalledWith({
            where: {
                id: { in: ["st_1", "st_2"] },
                organizationId: "org_1",
                deletedAt: null,
            },
        });
        expect(db.__tx.discountStore!.createMany).toHaveBeenCalledWith({
            data: [
                { discountId: "d_1", storeId: "st_1" },
                { discountId: "d_1", storeId: "st_2" },
            ],
        });
    });

    it("404s a target that belongs to another business", async () => {
        db.product.count!.mockResolvedValue(1); // two named, one is ours
        await expect(
            service.create("org_1", {
                code: "LOAF",
                kind: "PERCENTAGE",
                percent: "5",
                appliesTo: "PRODUCT",
                targetIds: ["p_ours", "p_theirs"],
            }),
        ).rejects.toThrow(NotFoundException);
        expect(db.__tx.discount!.create).not.toHaveBeenCalled();
    });

    it.each([
        ["COLLECTION", "category"],
        ["PRODUCT", "product"],
    ] as const)(
        "checks %s targets through their storefront's business",
        async (appliesTo, model) => {
            db[model].count!.mockResolvedValue(1);
            await service.create("org_1", {
                code: "SCOPED",
                kind: "PERCENTAGE",
                percent: "5",
                appliesTo,
                targetIds: ["t_1"],
            });
            expect(db[model].count).toHaveBeenCalledWith({
                where: {
                    id: { in: ["t_1"] },
                    store: { organizationId: "org_1" },
                },
            });
        },
    );

    it("refuses a code the business already has, on the code field", async () => {
        db.discount.findUnique!.mockResolvedValue({ id: "d_other" });
        const err = await service
            .create("org_1", {
                code: "MARKETDAY",
                kind: "PERCENTAGE",
                percent: "15",
            })
            .catch((e: ConflictException) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            message: "MARKETDAY is already a code in this business",
            details: { field: "code" },
        });
    });

    it("needs a currency for an amount off", async () => {
        await expect(
            service.create("org_1", {
                code: "TENOFF",
                kind: "FIXED_AMOUNT",
                amount: "10",
            }),
        ).rejects.toThrow(/needs its currency/);
    });

    it("refuses a percentage over 100", async () => {
        await expect(
            service.create("org_1", {
                code: "ALL",
                kind: "PERCENTAGE",
                percent: "101",
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it("refuses a narrow reach with nothing named", async () => {
        await expect(
            service.create("org_1", {
                code: "X1",
                kind: "PERCENTAGE",
                percent: "5",
                appliesTo: "COLLECTION",
            }),
        ).rejects.toThrow(/at least one/);
    });

    it("refuses a code that ends before it starts", async () => {
        await expect(
            service.create("org_1", {
                code: "X2",
                kind: "PERCENTAGE",
                percent: "5",
                startsAt: "2026-10-02T00:00:00Z",
                endsAt: "2026-10-01T00:00:00Z",
            }),
        ).rejects.toThrow(/end after it starts/);
    });
});

describe("update", () => {
    it("clears the reach when a code is widened to the whole business", async () => {
        db.discount.findFirst!.mockResolvedValue(
            row({
                appliesTo: "STOREFRONT",
                stores: [{ store: { id: "st_1", name: "High Street" } }],
            }),
        );
        await service.update("org_1", "d_1", { appliesTo: "BUSINESS" });
        expect(db.__tx.discountStore!.deleteMany).toHaveBeenCalledWith({
            where: { discountId: "d_1" },
        });
        expect(db.__tx.discountStore!.createMany).not.toHaveBeenCalled();
    });

    it("leaves the reach alone when only the end date changes", async () => {
        await service.update("org_1", "d_1", {
            endsAt: "2026-09-30T23:59:59Z",
        });
        expect(db.__tx.discountStore!.deleteMany).not.toHaveBeenCalled();
    });

    it("only finds codes in this business", async () => {
        db.discount.findFirst!.mockResolvedValue(null);
        await expect(
            service.update("org_1", "d_x", { endsAt: null }),
        ).rejects.toThrow(NotFoundException);
        expect(db.discount.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "d_x", organizationId: "org_1" },
            }),
        );
    });
});

describe("DiscountInputDto", () => {
    const check = async (body: Record<string, unknown>) =>
        validate(plainToInstance(DiscountInputDto, body));

    it("refuses a percentage finer than two decimals, accepts 12.35", async () => {
        expect(await check({ percent: "12.345" })).not.toHaveLength(0);
        expect(await check({ percent: "12.35" })).toHaveLength(0);
    });

    it("normalises a code to upper case and refuses spaces", async () => {
        const dto = plainToInstance(DiscountInputDto, { code: " market-day " });
        expect(dto.code).toBe("MARKET-DAY");
        expect(await check({ code: "two words" })).not.toHaveLength(0);
    });
});
