/**
 * Pricing a site's bag (round-2 G13), pure: each line from its listing, its
 * "can sell", the ways the order may leave, the fee and the total. Nothing
 * the browser says about money is an input here at all.
 */
import type { BagLine, QuoteListing, QuoteShelf } from "./checkout-quote";
import {
    buildQuote,
    checkoutWays,
    deliveryCents,
    feeCents,
    MAX_LINE_QUANTITY,
    quoteLines,
} from "./checkout-quote";

function listing(
    id: string,
    over: Partial<QuoteListing["product"]> & {
        soldOutAt?: Date | null;
        variantIds?: string[];
    } = {},
): QuoteListing {
    const { soldOutAt = null, variantIds = [], ...product } = over;
    return {
        id,
        soldOutAt,
        variantIds,
        product: {
            id: `p-${id}`,
            slug: `slug-${id}`,
            name: `Product ${id}`,
            status: "PUBLISHED",
            price: "250.00",
            stockTracked: false,
            fulfilmentTypes: [],
            cover: null,
            variants: [],
            ...product,
        },
    };
}

const line = (
    listingId: string,
    quantity = 1,
    variantId: string | null = null,
): BagLine => ({ listingId, variantId, quantity });

const NO_FEES = { localDeliveryFee: null, shippingFee: null };

describe("quoteLines", () => {
    it("prices each line from its listing, the variant's own price first", () => {
        const sourdough = listing("l1", {
            variants: [
                { id: "small", title: "Small", price: "180.00" },
                { id: "large", title: "Large", price: null },
            ],
            variantIds: ["small", "large"],
        });
        const [small, large] = quoteLines(
            [line("l1", 2, "small"), line("l1", 1, "large")],
            [sourdough],
            [],
            true,
        );
        expect(small).toMatchObject({
            unitCents: 18000,
            quantity: 2,
            variantTitle: "Small",
            state: "ok",
        });
        expect(large).toMatchObject({ unitCents: 25000, state: "ok" });
    });

    it("joins the same listing and variant, capped at the most a line takes", () => {
        const lines = quoteLines(
            [line("l1", 60), line("l1", 60)],
            [listing("l1")],
            [],
            true,
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    });

    it("calls a line gone when its listing, product or option is no longer sold here", () => {
        const lines = quoteLines(
            [
                line("missing"),
                line("draft"),
                line("opts", 1, "not-listed"),
                line("opts"),
                line("plain", 1, "phantom"),
            ],
            [
                listing("draft", { status: "ARCHIVED" }),
                listing("opts", {
                    variants: [
                        { id: "listed", title: "A", price: null },
                        { id: "not-listed", title: "B", price: null },
                    ],
                    variantIds: ["listed"],
                }),
                listing("plain"),
            ],
            [],
            true,
        );
        expect(lines.map((l) => l.state)).toEqual([
            "gone",
            "gone",
            "gone",
            "gone",
            "gone",
        ]);
        expect(lines.every((l) => l.unitCents === 0)).toBe(true);
        // An unpublished product is never named, linked or shown (#20).
        expect(lines[1]).toMatchObject({
            name: "No longer sold here",
            slug: null,
            image: null,
        });
        // A published product whose option went keeps its own name.
        expect(lines[2]).toMatchObject({
            name: "Product opts",
            slug: "slug-opts",
        });
    });

    it("says how many are left only for a short line (#20)", () => {
        const tracked = listing("l1", { stockTracked: true });
        const shelves: QuoteShelf[] = [
            { productId: "p-l1", variantId: null, onHand: 40, promised: 0 },
        ];
        expect(
            quoteLines([line("l1", 1)], [tracked], shelves, true)[0]?.available,
        ).toBeNull();
    });

    it("reads on hand minus promised for a product that counts stock", () => {
        const tracked = listing("l1", { stockTracked: true });
        const shelves: QuoteShelf[] = [
            { productId: "p-l1", variantId: null, onHand: 5, promised: 3 },
        ];
        expect(
            quoteLines([line("l1", 2)], [tracked], shelves, true)[0],
        ).toMatchObject({ state: "ok", available: null });
        expect(
            quoteLines([line("l1", 3)], [tracked], shelves, true)[0],
        ).toMatchObject({ state: "short", available: 2 });
        // On hand equal to promised is Sold out.
        expect(
            quoteLines(
                [line("l1")],
                [tracked],
                [{ ...shelves[0], promised: 5 } as QuoteShelf],
                true,
            )[0],
        ).toMatchObject({ state: "sold-out", available: 0 });
        // No shelf at the storefront: nothing to sell.
        expect(quoteLines([line("l1")], [tracked], [], true)[0]?.state).toBe(
            "sold-out",
        );
    });

    it("sells an untracked product unless it was marked Sold out by hand", () => {
        const counting = listing("l1", { stockTracked: true });
        // The business's switch is off: it counts nothing, so it sells.
        expect(
            quoteLines([line("l1", 9)], [counting], [], false)[0],
        ).toMatchObject({ state: "ok", available: null });
        const marked = listing("l2", { soldOutAt: new Date() });
        expect(quoteLines([line("l2")], [marked], [], true)[0]?.state).toBe(
            "sold-out",
        );
    });
});

describe("checkoutWays and fees", () => {
    it("offers the storefront's ways that every line allows (B12)", () => {
        const lines = quoteLines(
            [line("a"), line("b")],
            [
                listing("a", { fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"] }),
                listing("b"),
            ],
            [],
            true,
        );
        expect(
            checkoutWays(lines, ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        expect(checkoutWays(lines, ["SHIPPING"])).toEqual([]);
    });

    it("never offers Digital, even when every product lists it", () => {
        const lines = quoteLines(
            [line("a")],
            [listing("a", { fulfilmentTypes: ["DIGITAL", "PICKUP"] })],
            [],
            true,
        );
        expect(checkoutWays(lines, ["PICKUP"])).toEqual(["PICKUP"]);
    });

    it("adds the storefront's flat fee for delivery, and nothing for pick-up", () => {
        const fees = { localDeliveryFee: "60.00", shippingFee: "120.50" };
        expect(feeCents("PICKUP", fees)).toBe(0);
        expect(feeCents("LOCAL_DELIVERY", fees)).toBe(6000);
        expect(feeCents("SHIPPING", fees)).toBe(12050);
        expect(feeCents("SHIPPING", NO_FEES)).toBe(0);
    });
});

describe("buildQuote", () => {
    const bread = listing("l1", { price: "250.00" });

    it("totals the lines and the chosen way's fee, and is ready to pay", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines([line("l1", 2)], [bread], [], true),
            storefrontWays: ["PICKUP", "LOCAL_DELIVERY"],
            fees: { localDeliveryFee: "60.00", shippingFee: null },
            asked: "LOCAL_DELIVERY",
        });
        expect(quote).toMatchObject({
            currency: "INR",
            subtotal: "500.00",
            delivery: "60.00",
            total: "560.00",
            fulfilment: "LOCAL_DELIVERY",
            ready: true,
        });
        expect(quote.ways).toEqual([
            { type: "PICKUP", label: "Pick-up", fee: null },
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "60.00" },
        ]);
        expect(quote.lines[0]).toMatchObject({
            unitPrice: "250.00",
            amount: "500.00",
        });
    });

    it("picks the only way on its own, and none of several until asked", () => {
        const lines = quoteLines([line("l1")], [bread], [], true);
        expect(
            buildQuote({
                currency: "INR",
                lines,
                storefrontWays: ["PICKUP"],
                fees: NO_FEES,
                asked: null,
            }).fulfilment,
        ).toBe("PICKUP");
        const several = buildQuote({
            currency: "INR",
            lines,
            storefrontWays: ["PICKUP", "SHIPPING"],
            fees: NO_FEES,
            asked: null,
        });
        expect(several.fulfilment).toBeNull();
        expect(several.ready).toBe(false);
        // A way the storefront doesn't offer is not chosen.
        expect(
            buildQuote({
                currency: "INR",
                lines,
                storefrontWays: ["PICKUP", "SHIPPING"],
                fees: NO_FEES,
                asked: "LOCAL_DELIVERY",
            }).fulfilment,
        ).toBeNull();
    });

    it("is not ready while a line can't be sold, and counts nothing for a gone line", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines([line("l1"), line("gone")], [bread], [], true),
            storefrontWays: ["PICKUP"],
            fees: NO_FEES,
            asked: "PICKUP",
        });
        expect(quote.ready).toBe(false);
        expect(quote.total).toBe("250.00");
        expect(quote.lines[1]).toMatchObject({ state: "gone", amount: "0.00" });
    });

    it("is not ready for an empty bag", () => {
        expect(
            buildQuote({
                currency: "INR",
                lines: [],
                storefrontWays: ["PICKUP"],
                fees: NO_FEES,
                asked: "PICKUP",
            }).ready,
        ).toBe(false);
    });
});

/**
 * "Free delivery over" (`StoreSettings.freeShippingThreshold`): at or above
 * it, judged on the items after any code and before delivery, Local
 * delivery and Shipping add nothing. Pick-up never adds anything.
 */
describe("free delivery over an amount", () => {
    const bread = listing("l1", { price: "250.00" });
    const FEES = {
        localDeliveryFee: "60.00",
        shippingFee: "120.00",
        freeOver: "1000.00" as string | null,
    };
    const quoteFor = (
        quantity: number,
        asked: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING",
        fees: {
            localDeliveryFee: string | null;
            shippingFee: string | null;
            freeOver: string | null;
        } = FEES,
        discountCents?: number,
    ) =>
        buildQuote({
            currency: "INR",
            lines: quoteLines([line("l1", quantity)], [bread], [], true),
            storefrontWays: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
            fees,
            asked,
            discount:
                discountCents === undefined
                    ? null
                    : {
                          view: { code: "TEN", applied: true, amount: "x" },
                          cents: discountCents,
                      },
        });

    it("charges the fee below the amount, and says how much more is needed", () => {
        const quote = quoteFor(3, "LOCAL_DELIVERY"); // 750.00
        expect(quote).toMatchObject({
            subtotal: "750.00",
            delivery: "60.00",
            total: "810.00",
            freeDelivery: { over: "1000.00", short: "250.00" },
        });
        expect(quote.ways.map((w) => w.fee)).toEqual([null, "60.00", "120.00"]);
    });

    it("is free at the amount exactly, for Local delivery and Shipping", () => {
        const local = quoteFor(4, "LOCAL_DELIVERY"); // 1000.00
        expect(local).toMatchObject({
            delivery: "0.00",
            total: "1000.00",
            freeDelivery: { over: "1000.00", short: null },
        });
        expect(local.ways.map((w) => w.fee)).toEqual([null, null, null]);
        expect(quoteFor(4, "SHIPPING")).toMatchObject({
            delivery: "0.00",
            total: "1000.00",
        });
    });

    it("is free above the amount", () => {
        expect(quoteFor(5, "SHIPPING")).toMatchObject({
            subtotal: "1250.00",
            delivery: "0.00",
            total: "1250.00",
        });
    });

    it("charges the fee whatever the total with no amount set", () => {
        expect(
            quoteFor(8, "LOCAL_DELIVERY", { ...FEES, freeOver: null }),
        ).toMatchObject({
            delivery: "60.00",
            total: "2060.00",
            freeDelivery: null,
        });
    });

    it("leaves pick-up free either way", () => {
        expect(quoteFor(1, "PICKUP")).toMatchObject({
            delivery: "0.00",
            total: "250.00",
        });
        expect(quoteFor(5, "PICKUP")).toMatchObject({
            delivery: "0.00",
            total: "1250.00",
        });
    });

    it("says nothing about it when no way offered carries a fee", () => {
        expect(
            quoteFor(1, "PICKUP", { ...NO_FEES, freeOver: "1000.00" })
                .freeDelivery,
        ).toBeNull();
    });

    it("judges the amount on the items after a code, not before", () => {
        // 1000.00 of items, 100.00 off: 900.00 is under the amount.
        expect(quoteFor(4, "LOCAL_DELIVERY", FEES, 10000)).toMatchObject({
            subtotal: "1000.00",
            delivery: "60.00",
            total: "960.00",
            freeDelivery: { over: "1000.00", short: "100.00" },
        });
        // 1250.00 less 100.00 is 1150.00: still free.
        expect(quoteFor(5, "LOCAL_DELIVERY", FEES, 10000)).toMatchObject({
            delivery: "0.00",
            total: "1150.00",
            freeDelivery: { short: null },
        });
    });

    it("works in whole minor units: a paisa short is still charged", () => {
        const fees = { ...FEES, freeOver: "1000.01" };
        expect(deliveryCents("LOCAL_DELIVERY", fees, 100000)).toBe(6000);
        expect(deliveryCents("LOCAL_DELIVERY", fees, 100001)).toBe(0);
        expect(deliveryCents("PICKUP", fees, 0)).toBe(0);
        // Zero is no amount: the fee is charged.
        expect(
            deliveryCents("SHIPPING", { ...FEES, freeOver: "0.00" }, 500000),
        ).toBe(12000);
    });
});
