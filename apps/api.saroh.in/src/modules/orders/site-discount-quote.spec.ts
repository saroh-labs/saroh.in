/**
 * A discount code in the site's bag (DEC-104): the quote judges it with the
 * counter's evaluation over the lines it priced, takes what it allows off
 * the lines (never the delivery, never below zero), and — when it takes
 * nothing — says why. The listings are mocked rows; the evaluation is a
 * stub standing in for `DiscountsService.checkForOrder`, whose own rules
 * are `check-for-order.spec.ts`. Amounts are made up.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            productListing: { findMany: jest.fn() },
            storeSettings: { findUnique: jest.fn() },
            stockLevel: { findMany: jest.fn() },
        },
    };
});

jest.mock("../stock/tracking", () => ({
    businessTracksStock: jest.fn().mockResolvedValue(false),
}));

import { prisma } from "@saroh/database";

import type { CodeCheck } from "../discounts/discounts.service";
import { priceBag } from "./checkout-bag";
import type { QuotedLine } from "./checkout-quote";
import { buildQuote, discountLines } from "./checkout-quote";

const db = prisma as unknown as {
    productListing: { findMany: jest.Mock };
    storeSettings: { findUnique: jest.Mock };
    stockLevel: { findMany: jest.Mock };
};

const scope = {
    organizationId: "org_1",
    storefront: { id: "store_1", name: "Hill Road" },
};

const quoted = (over: Partial<QuotedLine> = {}): QuotedLine => ({
    listingId: "l_1",
    variantId: null,
    productId: "p_1",
    categoryId: "cat_1",
    slug: "sourdough",
    name: "Sourdough",
    variantTitle: null,
    image: null,
    unitCents: 20_000,
    quantity: 2,
    state: "ok",
    available: null,
    fulfilmentTypes: [],
    ...over,
});

const FEES = { localDeliveryFee: "50.00", shippingFee: null };

describe("buildQuote with a code", () => {
    it("takes the code off the lines, and the delivery stays as it is", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: [quoted()],
            storefrontWays: ["LOCAL_DELIVERY"],
            fees: FEES,
            asked: "LOCAL_DELIVERY",
            discount: {
                view: { code: "SAVE10", applied: true, amount: "40.00" },
                cents: 4_000,
            },
        });
        expect(quote).toMatchObject({
            subtotal: "400.00",
            delivery: "50.00",
            discount: { code: "SAVE10", applied: true, amount: "40.00" },
            total: "410.00",
        });
    });

    it("never takes more than the lines come to", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: [quoted()],
            storefrontWays: ["LOCAL_DELIVERY"],
            fees: FEES,
            asked: "LOCAL_DELIVERY",
            discount: {
                view: { code: "BIG", applied: true, amount: "400.00" },
                cents: 99_000,
            },
        });
        expect(quote.total).toBe("50.00");
    });

    it("keeps the full total, and the reason, for a refused code", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: [quoted()],
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
            discount: {
                view: {
                    code: "OLD",
                    applied: false,
                    reason: "EXPIRED",
                    message: "OLD has ended.",
                },
                cents: 0,
            },
        });
        expect(quote.total).toBe("400.00");
        expect(quote.discount).toEqual({
            code: "OLD",
            applied: false,
            reason: "EXPIRED",
            message: "OLD has ended.",
        });
    });

    it("has no discount when no code was typed", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: [quoted()],
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
        });
        expect(quote.discount).toBeNull();
        expect(quote.total).toBe("400.00");
    });
});

describe("discountLines", () => {
    it("hands the evaluation each line it can name, with its collection", () => {
        expect(
            discountLines([
                quoted(),
                quoted({ listingId: "l_2", productId: null, state: "gone" }),
            ]),
        ).toEqual([
            {
                productId: "p_1",
                categoryId: "cat_1",
                unitCents: 20_000,
                quantity: 2,
            },
        ]);
    });
});

describe("priceBag with a code", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.storeSettings.findUnique.mockResolvedValue({
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
            shippingEnabled: false,
            localDeliveryFee: null,
            shippingFee: null,
            kind: "SHOP",
            address: "12 Hill Road",
            openingHours: null,
        });
        db.productListing.findMany.mockResolvedValue([
            {
                id: "l_1",
                soldOutAt: null,
                variants: [],
                product: {
                    id: "p_1",
                    slug: "sourdough",
                    name: "Sourdough",
                    status: "PUBLISHED",
                    price: "200.00",
                    categoryId: "cat_1",
                    stockTracked: false,
                    fulfilmentTypes: [],
                    images: [],
                    variants: [],
                },
            },
        ]);
        db.stockLevel.findMany.mockResolvedValue([]);
    });

    const bag = [{ listingId: "l_1", variantId: null, quantity: 2 }];

    it("judges the code over the priced lines and applies it", async () => {
        const check = jest
            .fn<Promise<CodeCheck>, [unknown]>()
            .mockResolvedValue({
                ok: true,
                applied: {
                    discountId: "d_1",
                    code: "SAVE10",
                    kind: "PERCENTAGE",
                    percentBps: 1000,
                    ruleAmount: null,
                    usageLimit: null,
                    amountCents: 4_000,
                },
            });

        const { quote, applied } = await priceBag(
            scope,
            bag,
            "PICKUP",
            undefined,
            {
                code: "SAVE10",
                check,
            },
        );

        // The evaluation sees the server's prices, never the browser's.
        expect(check).toHaveBeenCalledWith({
            storeId: "store_1",
            currency: "INR",
            lines: [
                {
                    productId: "p_1",
                    categoryId: "cat_1",
                    unitCents: 20_000,
                    quantity: 2,
                },
            ],
        });
        expect(quote).toMatchObject({
            subtotal: "400.00",
            discount: { code: "SAVE10", applied: true, amount: "40.00" },
            total: "360.00",
        });
        expect(applied).toMatchObject({
            discountId: "d_1",
            amountCents: 4_000,
        });
    });

    it("prices the bag in full and says why a refused code took nothing", async () => {
        const check = jest
            .fn<Promise<CodeCheck>, [unknown]>()
            .mockResolvedValue({
                ok: false,
                code: "SAVE10",
                reason: "EXHAUSTED",
            });

        const { quote, applied } = await priceBag(
            scope,
            bag,
            "PICKUP",
            undefined,
            {
                code: "SAVE10",
                check,
            },
        );

        expect(quote.total).toBe("400.00");
        expect(quote.discount).toEqual({
            code: "SAVE10",
            applied: false,
            reason: "EXHAUSTED",
            message: "SAVE10 has been used as many times as it allows.",
        });
        expect(applied).toBeNull();
    });
});
