import type { PriceTerms } from "../invoices/gst-price";
import type { QuoteListing } from "./checkout-quote";
import { buildQuote, discountLines, quoteLines } from "./checkout-quote";

/**
 * The site's bag under each way a business carries GST (12 Oct 2026): each
 * line is the amount to pay, the customer's GST words ride with it, and the
 * quote says how much GST is inside the total. Pure; amounts are made up.
 */

const INCLUDES: PriceTerms = { registered: true, mode: "INCLUDED" };
const ADDS: PriceTerms = { registered: true, mode: "ADDED" };

const listing = (
    over: Partial<QuoteListing["product"]> = {},
    id = "l_1",
): QuoteListing => ({
    id,
    soldOutAt: null,
    variantIds: [],
    product: {
        id: `p_${id}`,
        slug: "serum",
        name: "Face serum",
        status: "PUBLISHED",
        price: "1000.00",
        gstRate: "18",
        gstPriceMode: null,
        categoryId: null,
        stockTracked: false,
        fulfilmentTypes: [],
        cover: null,
        variants: [],
        ...over,
    },
});

const bag = (quantity = 1, listingId = "l_1") => [
    { listingId, variantId: null, quantity },
];

const FEES = { localDeliveryFee: "59.00", shippingFee: null };
const TAX = { registered: true, deliveryRateBps: 1800 };

describe("pricing a bag line", () => {
    it("with no terms (a business that charges no GST) is what it always was", () => {
        const [line] = quoteLines(bag(2), [listing()], [], false);
        expect(line).toMatchObject({
            unitCents: 100_000,
            listCents: 100_000,
            gstPriceMode: null,
            rateBps: null,
            gst: null,
        });
    });

    it("an existing registered business: ₹1,000 to pay, ₹152.54 GST inside", () => {
        const [line] = quoteLines(bag(), [listing()], [], false, INCLUDES);
        expect(line).toMatchObject({
            unitCents: 100_000,
            listCents: 100_000,
            gstPriceMode: "INCLUDED",
            rateBps: 1800,
            gst: {
                mode: "INCLUDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 15_254,
                payCents: 100_000,
            },
        });
    });

    it("'GST is added': ₹1,000 + ₹180 is ₹1,180 a unit", () => {
        const [line] = quoteLines(bag(3), [listing()], [], false, ADDS);
        expect(line).toMatchObject({
            unitCents: 118_000,
            listCents: 100_000,
            gstPriceMode: "ADDED",
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 18_000,
                payCents: 118_000,
            },
        });
    });

    it("a product's own choice wins over the business's", () => {
        const [added] = quoteLines(
            bag(),
            [listing({ gstPriceMode: "ADDED" })],
            [],
            false,
            INCLUDES,
        );
        expect(added?.unitCents).toBe(118_000);
        const [included] = quoteLines(
            bag(),
            [listing({ gstPriceMode: "INCLUDED" })],
            [],
            false,
            ADDS,
        );
        expect(included?.unitCents).toBe(100_000);
    });

    it("an option's own price is the one GST is added to", () => {
        const withOptions: QuoteListing = {
            ...listing({
                variants: [{ id: "v_1", title: "50 ml", price: "1500.00" }],
            }),
            variantIds: ["v_1"],
        };
        const [line] = quoteLines(
            [{ listingId: "l_1", variantId: "v_1", quantity: 1 }],
            [withOptions],
            [],
            false,
            ADDS,
        );
        // ₹1,500 + ₹270.
        expect(line?.unitCents).toBe(177_000);
        expect(line?.listCents).toBe(150_000);
    });

    it("an exempt product adds nothing and says nothing", () => {
        const [line] = quoteLines(
            bag(),
            [listing({ gstRate: "0" })],
            [],
            false,
            ADDS,
        );
        expect(line).toMatchObject({
            unitCents: 100_000,
            gstPriceMode: null,
            gst: null,
        });
    });

    it("a code is judged on the amount to pay", () => {
        const lines = quoteLines(bag(2), [listing()], [], false, ADDS);
        expect(discountLines(lines)).toEqual([
            {
                productId: "p_l_1",
                categoryId: null,
                unitCents: 118_000,
                quantity: 2,
            },
        ]);
    });
});

describe("the quote", () => {
    it("'GST is added': 2 × ₹1,180 is ₹2,360 to pay, ₹360 of it GST", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(bag(2), [listing()], [], false, ADDS),
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
            tax: TAX,
        });
        expect(quote.lines[0]).toMatchObject({
            unitPrice: "1180.00",
            amount: "2360.00",
            gst: { mode: "ADDED", gstCents: 18_000, payCents: 118_000 },
        });
        expect(quote.subtotal).toBe("2360.00");
        expect(quote.total).toBe("2360.00");
        expect(quote.gst).toBe("360.00");
    });

    it("an existing business: 2 × ₹1,000 is ₹2,000, ₹305.08 of it GST", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(bag(2), [listing()], [], false, INCLUDES),
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
            tax: TAX,
        });
        expect(quote.lines[0]).toMatchObject({
            unitPrice: "1000.00",
            amount: "2000.00",
        });
        expect(quote.total).toBe("2000.00");
        // 200000 / 1.18 = 169491.53 → ₹1,694.92 taxable.
        expect(quote.gst).toBe("305.08");
    });

    it("delivery is charged as typed, and its GST is counted inside the total", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(bag(1), [listing()], [], false, ADDS),
            storefrontWays: ["LOCAL_DELIVERY"],
            fees: FEES,
            asked: "LOCAL_DELIVERY",
            tax: TAX,
        });
        expect(quote.delivery).toBe("59.00");
        expect(quote.total).toBe("1239.00");
        // ₹180 on the serum and ₹9 inside the ₹59 delivery.
        expect(quote.gst).toBe("189.00");
    });

    it("a code comes off before the GST inside is counted", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(bag(1), [listing()], [], false, ADDS),
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
            discount: {
                view: { code: "TEN", applied: true, amount: "118.00" },
                cents: 11_800,
            },
            tax: TAX,
        });
        expect(quote.total).toBe("1062.00");
        expect(quote.gst).toBe("162.00");
    });

    it("says nothing about GST for a business that charges none", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(bag(2), [listing()], [], false),
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
        });
        expect(quote.total).toBe("2000.00");
        expect(quote.gst).toBeNull();
        expect(quote.lines[0]?.gst).toBeNull();
    });

    it("says nothing about GST when every line is exempt", () => {
        const quote = buildQuote({
            currency: "INR",
            lines: quoteLines(
                bag(2),
                [listing({ gstRate: "0" })],
                [],
                false,
                ADDS,
            ),
            storefrontWays: ["PICKUP"],
            fees: FEES,
            asked: "PICKUP",
            tax: TAX,
        });
        expect(quote.total).toBe("2000.00");
        expect(quote.gst).toBeNull();
    });
});
