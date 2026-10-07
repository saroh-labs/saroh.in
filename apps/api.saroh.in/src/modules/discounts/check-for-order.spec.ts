// One discount evaluation for the counter and the site's checkout (DEC-104):
// `checkForOrder` answers instead of throwing, with the counter's reasons;
// `redeemForOrder` is the same decision with the counter's 400; and every
// order that uses a code — wherever it was typed — records its use through
// `recordRedemptionInTx`, re-counted against the code's limit. The database
// is mocked; codes and amounts are made up.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            discount: { findUnique: jest.fn() },
            category: { findMany: jest.fn() },
        },
    };
});

import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { DiscountsService } from "./discounts.service";
import { customerRefusalMessage } from "./redeem";
import { recordRedemptionInTx } from "./redemption";

const db = prisma as unknown as {
    discount: { findUnique: jest.Mock };
    category: { findMany: jest.Mock };
};

const code = (over: Record<string, unknown> = {}) => ({
    id: "d_1",
    code: "SAVE10",
    kind: "PERCENTAGE",
    percentBps: 1000,
    amount: null,
    currency: null,
    appliesTo: "BUSINESS",
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    stores: [],
    categories: [],
    products: [],
    _count: { redemptions: 0 },
    ...over,
});

const order = {
    storeId: "store_1",
    currency: "INR",
    lines: [
        {
            productId: "p_1",
            categoryId: null,
            unitCents: 20_000,
            quantity: 2,
        },
    ],
};

const service = new DiscountsService();

beforeEach(() => jest.clearAllMocks());

describe("checkForOrder", () => {
    it("applies a live code, normalising what was typed", async () => {
        db.discount.findUnique.mockResolvedValue(code());

        const check = await service.checkForOrder("org_1", " save10 ", order);

        expect(check).toEqual({
            ok: true,
            applied: expect.objectContaining({
                discountId: "d_1",
                code: "SAVE10",
                amountCents: 4_000,
            }),
        });
        // Looked up in the business it was asked for, and nowhere else.
        expect(db.discount.findUnique.mock.calls[0][0].where).toEqual({
            organizationId_code: { organizationId: "org_1", code: "SAVE10" },
        });
    });

    it("refuses an ended code with EXPIRED", async () => {
        db.discount.findUnique.mockResolvedValue(
            code({ endsAt: new Date("2020-01-01T00:00:00Z") }),
        );
        await expect(
            service.checkForOrder("org_1", "SAVE10", order),
        ).resolves.toEqual({ ok: false, code: "SAVE10", reason: "EXPIRED" });
    });

    it("refuses a code at its limit with EXHAUSTED, counting every use", async () => {
        // Uses are redemptions, however they were taken: the counter's
        // and the site's are one count.
        db.discount.findUnique.mockResolvedValue(
            code({ usageLimit: 2, _count: { redemptions: 2 } }),
        );
        await expect(
            service.checkForOrder("org_1", "SAVE10", order),
        ).resolves.toEqual({ ok: false, code: "SAVE10", reason: "EXHAUSTED" });
    });

    it("refuses a product code with nothing it reaches as NO_MATCH", async () => {
        db.discount.findUnique.mockResolvedValue(
            code({ appliesTo: "PRODUCT", products: [{ productId: "p_9" }] }),
        );
        await expect(
            service.checkForOrder("org_1", "SAVE10", order),
        ).resolves.toEqual({ ok: false, code: "SAVE10", reason: "NO_MATCH" });
    });

    it("says UNKNOWN for a code the business doesn't have", async () => {
        db.discount.findUnique.mockResolvedValue(null);
        await expect(
            service.checkForOrder("org_1", "nope", order),
        ).resolves.toEqual({ ok: false, code: "NOPE", reason: "UNKNOWN" });
    });

    it("says NO_BUSINESS without looking, for a storefront with no business", async () => {
        await expect(
            service.checkForOrder(null, "SAVE10", order),
        ).resolves.toEqual({
            ok: false,
            code: "SAVE10",
            reason: "NO_BUSINESS",
        });
        expect(db.discount.findUnique).not.toHaveBeenCalled();
    });
});

describe("redeemForOrder (the counter)", () => {
    it("throws the same refusal as a 400 on the code's field", async () => {
        db.discount.findUnique.mockResolvedValue(
            code({ endsAt: new Date("2020-01-01T00:00:00Z") }),
        );
        const err = await service
            .redeemForOrder("org_1", "SAVE10", order)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            message: "SAVE10 has ended.",
            details: { field: "discountCode" },
        });
    });
});

describe("the customer's words", () => {
    it("names every refusal in a shopper's terms", () => {
        expect(customerRefusalMessage("SAVE10", "EXPIRED")).toBe(
            "SAVE10 has ended.",
        );
        expect(customerRefusalMessage("SAVE10", "EXHAUSTED")).toBe(
            "SAVE10 has been used as many times as it allows.",
        );
        expect(customerRefusalMessage("SAVE10", "NO_MATCH")).toBe(
            "SAVE10 doesn't apply to anything in your bag.",
        );
        expect(customerRefusalMessage("NOPE", "UNKNOWN")).toBe(
            "NOPE isn't a code this shop has. Check it and try again.",
        );
        // Nothing about locations or currencies: the shop can't take it.
        for (const reason of ["STOREFRONT", "CURRENCY"] as const) {
            expect(customerRefusalMessage("SAVE10", reason)).toBe(
                "SAVE10 can't be used in this shop.",
            );
        }
    });
});

describe("recordRedemptionInTx", () => {
    const applied = {
        discountId: "d_1",
        code: "SAVE10",
        kind: "PERCENTAGE" as const,
        percentBps: 1000,
        ruleAmount: null,
        usageLimit: 3,
        amountCents: 4_000,
    };
    const tx = () => ({
        discountRedemption: { count: jest.fn(), create: jest.fn() },
    });

    it("records the use with what came off, under the limit", async () => {
        const t = tx();
        t.discountRedemption.count.mockResolvedValue(2);

        await recordRedemptionInTx(
            t as never,
            applied,
            "order_1",
            "org_1",
            "INR",
        );

        expect(t.discountRedemption.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                discountId: "d_1",
                orderId: "order_1",
                amount: "40.00",
                currency: "INR",
                code: "SAVE10",
            }),
        });
    });

    it("refuses the use past the limit, whichever channel took the others", async () => {
        const t = tx();
        t.discountRedemption.count.mockResolvedValue(3);

        await expect(
            recordRedemptionInTx(
                t as never,
                applied,
                "order_1",
                "org_1",
                "INR",
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(t.discountRedemption.create).not.toHaveBeenCalled();
    });
});
