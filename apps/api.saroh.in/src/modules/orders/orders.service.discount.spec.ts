// Applying a discount code when an order is created: the API decides what
// comes off, records it in the order's own transaction, and refuses rather
// than charging full price. The real DiscountsService runs against a mocked
// database, so the order and discount halves are tested together.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        order: { create: jest.fn(), count: jest.fn() },
        customer: { findFirst: jest.fn() },
        product: { findFirst: jest.fn() },
        inventory: { findUnique: jest.fn(), update: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
        discount: { findUnique: jest.fn() },
        category: { findMany: jest.fn() },
        discountRedemption: { count: jest.fn(), create: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import { DiscountsService } from "../discounts/discounts.service";
import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>> & {
    $transaction: jest.Mock;
};

const MARKETDAY = {
    id: "d_1",
    code: "MARKETDAY",
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
};

function makeService(
    organizationId: string | null = "org_1",
    discounts: DiscountsService | null = new DiscountsService(),
) {
    const stores = {
        writableOrganization: jest.fn().mockResolvedValue({ organizationId }),
    } as unknown as StoresService;
    const activation = {
        firstOrderCreated: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivationEvents;
    return new OrdersService(stores, activation, discounts ?? undefined);
}

const DTO = {
    customerId: "c_1",
    items: [{ productId: "p_1", quantity: 2 }],
};

beforeEach(() => {
    jest.clearAllMocks();
    db.customer!.findFirst!.mockResolvedValue({ id: "c_1" });
    db.product!.findFirst!.mockResolvedValue({
        price: "20.00",
        categoryId: "cat_1",
    });
    db.inventory!.findUnique!.mockResolvedValue(null);
    db.order!.count!.mockResolvedValue(0);
    db.order!.create!.mockResolvedValue({ id: "o_1" });
    db.storeSettings!.findUnique!.mockResolvedValue({ currency: "INR" });
    db.discount!.findUnique!.mockResolvedValue(MARKETDAY);
    db.discountRedemption!.count!.mockResolvedValue(3);
});

const createData = () => db.order!.create!.mock.calls[0][0].data;

describe("OrdersService.create — discount codes", () => {
    it("takes off what the API works out and records the redemption with its rule", async () => {
        await makeService().create("st_1", "u_1", {
            ...DTO,
            discountCode: " marketday ",
        });
        // 15% of 40.00
        expect(createData()).toMatchObject({
            subtotal: "40.00",
            discount: "6.00",
            total: "34.00",
        });
        expect(db.discountRedemption!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                discountId: "d_1",
                orderId: "o_1",
                amount: "6.00",
                currency: "INR",
                code: "MARKETDAY",
                kind: "PERCENTAGE",
                percentBps: 1500,
                ruleAmount: null,
            },
        });
    });

    it("looks the code up in the storefront's own business only", async () => {
        await makeService().create("st_1", "u_1", {
            ...DTO,
            discountCode: "MARKETDAY",
        });
        expect(db.discount!.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId_code: {
                        organizationId: "org_1",
                        code: "MARKETDAY",
                    },
                },
            }),
        );
    });

    it("runs a coded order serializably, and an ordinary one as before", async () => {
        await makeService().create("st_1", "u_1", {
            ...DTO,
            discountCode: "MARKETDAY",
        });
        expect(db.$transaction.mock.calls[0][1]).toEqual({
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        jest.clearAllMocks();
        db.order!.create!.mockResolvedValue({ id: "o_2" });
        await makeService().create("st_1", "u_1", { ...DTO, discount: "5" });
        expect(db.$transaction.mock.calls[0][1]).toBeUndefined();
        expect(createData()).toMatchObject({ discount: "5.00" });
        expect(db.discountRedemption!.create).not.toHaveBeenCalled();
    });

    it("refuses a code and a typed amount together, creating nothing", async () => {
        const err = await makeService()
            .create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
                discount: "5",
            })
            .catch((e: BadRequestException) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            details: { field: "discountCode" },
        });
        expect(db.order!.create).not.toHaveBeenCalled();
    });

    it("lets the form's untouched 0 through with a code", async () => {
        await makeService().create("st_1", "u_1", {
            ...DTO,
            discountCode: "MARKETDAY",
            discount: "0",
        });
        expect(createData()).toMatchObject({ discount: "6.00" });
    });

    it("refuses an unknown code on its field, creating nothing", async () => {
        db.discount!.findUnique!.mockResolvedValue(null);
        await expect(
            makeService().create("st_1", "u_1", {
                ...DTO,
                discountCode: "NOPE",
            }),
        ).rejects.toThrow(/NOPE is not a code in this business/);
        expect(db.order!.create).not.toHaveBeenCalled();
    });

    it("refuses an ended code, naming why", async () => {
        db.discount!.findUnique!.mockResolvedValue({
            ...MARKETDAY,
            endsAt: new Date("2020-01-01T00:00:00Z"),
        });
        await expect(
            makeService().create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
            }),
        ).rejects.toThrow(/MARKETDAY has ended/);
    });

    it("matches a collection code on a product in a sub-collection", async () => {
        db.discount!.findUnique!.mockResolvedValue({
            ...MARKETDAY,
            appliesTo: "COLLECTION",
            categories: [{ categoryId: "cat_bakery" }],
        });
        db.category!.findMany!.mockResolvedValue([
            { id: "cat_bakery", parentId: null },
            { id: "cat_1", parentId: "cat_bakery" },
        ]);
        await makeService().create("st_1", "u_1", {
            ...DTO,
            discountCode: "MARKETDAY",
        });
        expect(createData()).toMatchObject({ discount: "6.00" });
    });

    it("refuses the last use when another order took it first", async () => {
        // Room when checked, full by the time the transaction counts.
        db.discountRedemption!.count!.mockResolvedValue(100);
        await expect(
            makeService().create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
            }),
        ).rejects.toThrow(ConflictException);
        expect(db.discountRedemption!.create).not.toHaveBeenCalled();
    });

    it("turns a serialization failure into a 409 naming the code", async () => {
        db.$transaction.mockRejectedValueOnce(
            new Prisma.PrismaClientKnownRequestError("conflict", {
                code: "P2034",
                clientVersion: "x",
            }),
        );
        await expect(
            makeService().create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
            }),
        ).rejects.toThrow(/MARKETDAY was just used by another order/);
    });

    it("refuses a code at a storefront with no business, rather than charging full price", async () => {
        await expect(
            makeService(null).create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
            }),
        ).rejects.toThrow(/not part of a business/);
        expect(db.order!.create).not.toHaveBeenCalled();
    });

    it("refuses a code when discounts are not wired, never creating at full price", async () => {
        await expect(
            makeService("org_1", null).create("st_1", "u_1", {
                ...DTO,
                discountCode: "MARKETDAY",
            }),
        ).rejects.toThrow(BadRequestException);
        expect(db.order!.create).not.toHaveBeenCalled();
    });
});
