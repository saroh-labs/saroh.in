// GST is part of MRP (12 Oct 2026) on an imported product row: judged as
// the product will stand once the row is written. Pure.
import type { PriceTerms } from "../invoices/gst-price";
import type { ProductMrpContext, StoredProductSums } from "./product-mrp";
import { productMrpIssues } from "./product-mrp";

const ADDED: PriceTerms = { registered: true, mode: "ADDED" };
const INCLUDED: PriceTerms = { registered: true, mode: "INCLUDED" };
const UNREGISTERED: PriceTerms = { registered: false, mode: "INCLUDED" };

const context = (
    terms: PriceTerms,
    over: Partial<ProductMrpContext> = {},
): ProductMrpContext => ({
    terms,
    policy: "UPDATE",
    existing: new Map(),
    currency: "INR",
    ...over,
});

const stored = (over: Partial<StoredProductSums> = {}): StoredProductSums => ({
    mrp: null,
    gstRate: null,
    gstPriceMode: null,
    currency: "INR",
    variants: [],
    ...over,
});

const WAYS_OUT =
    "Lower the price, raise the MRP, or set this product's price to include GST.";

describe("a new product's row", () => {
    it("GST is added: refused above its MRP on the MRP's column, with the sums", () => {
        // 1,000 + 180 = 1,180 > 1,100
        expect(
            productMrpIssues(
                {
                    name: "Face cream",
                    price: "1000",
                    mrp: "1100",
                    gstRate: "18",
                },
                "face-cream",
                context(ADDED),
            ),
        ).toEqual([
            {
                field: "mrp",
                message: `With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
            },
        ]);
    });

    it("GST is added: allowed at exactly the MRP, below it, and with no rate in the row", () => {
        const row = (mrp: string, gstRate?: string) =>
            productMrpIssues(
                { name: "Face cream", price: "1000", mrp, gstRate },
                "face-cream",
                context(ADDED),
            );
        expect(row("1180", "18")).toEqual([]);
        expect(row("1500", "18")).toEqual([]);
        // No rate: nothing is added, so ₹1,000 against ₹1,000.
        expect(row("1000")).toEqual([]);
    });

    it("at 5, 12 and 28 percent: ₹1,050, ₹1,120 and ₹1,280 to pay", () => {
        for (const [gstRate, pay, short] of [
            ["5", "1050", "1049.99"],
            ["12", "1120", "1119.99"],
            ["28", "1280", "1279.99"],
        ] as const) {
            const row = (mrp: string) =>
                productMrpIssues(
                    { name: "Face cream", price: "1000", mrp, gstRate },
                    "face-cream",
                    context(ADDED),
                );
            expect(row(pay)).toEqual([]);
            expect(row(short)).toHaveLength(1);
        }
    });

    it("prices include GST, or not registered: the typed price against the MRP", () => {
        for (const terms of [INCLUDED, UNREGISTERED]) {
            const row = (mrp: string) =>
                productMrpIssues(
                    { name: "Face cream", price: "1000", mrp, gstRate: "18" },
                    "face-cream",
                    context(terms),
                );
            expect(row("1100")).toEqual([]);
            expect(row("1000")).toEqual([]);
            expect(row("999")).toEqual([
                {
                    field: "mrp",
                    message: "MRP can't be lower than the price it sells for.",
                },
            ]);
        }
    });

    it("says nothing with no MRP", () => {
        expect(
            productMrpIssues(
                { name: "Face cream", price: "1000", gstRate: "18" },
                "face-cream",
                context(ADDED),
            ),
        ).toEqual([]);
    });
});

describe("a row that updates a product", () => {
    const existing = (sums: Partial<StoredProductSums>) =>
        new Map([["face-cream", stored(sums)]]);

    it("keeps the MRP and the rate the row leaves blank, and is refused on the price", () => {
        // The stored 18% and ₹1,100 MRP stand: 1,000 + 180 = 1,180.
        expect(
            productMrpIssues(
                { name: "Face cream", price: "1000" },
                "face-cream",
                context(ADDED, {
                    existing: existing({ mrp: "1100", gstRate: "18" }),
                }),
            ),
        ).toEqual([
            {
                field: "price",
                message: `With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
            },
        ]);
        // ₹900 + ₹162 = ₹1,062: under it.
        expect(
            productMrpIssues(
                { name: "Face cream", price: "900" },
                "face-cream",
                context(ADDED, {
                    existing: existing({ mrp: "1100", gstRate: "18" }),
                }),
            ),
        ).toEqual([]);
    });

    it("follows the product's own choice, both ways", () => {
        const row = { name: "Face cream", price: "1000", mrp: "1100" };
        expect(
            productMrpIssues(
                row,
                "face-cream",
                context(INCLUDED, {
                    existing: existing({
                        gstRate: "18",
                        gstPriceMode: "ADDED",
                    }),
                }),
            ),
        ).toHaveLength(1);
        expect(
            productMrpIssues(
                row,
                "face-cream",
                context(ADDED, {
                    existing: existing({
                        gstRate: "18",
                        gstPriceMode: "INCLUDED",
                    }),
                }),
            ),
        ).toEqual([]);
    });

    it("names an option the new rate takes over its own MRP", () => {
        // Large: 1,200 + 216 = 1,416 > 1,300
        expect(
            productMrpIssues(
                { name: "Face cream", price: "1000", gstRate: "18" },
                "face-cream",
                context(ADDED, {
                    existing: existing({
                        mrp: "1500",
                        gstRate: "5",
                        variants: [
                            { title: "Large", price: "1200", mrp: "1300" },
                        ],
                    }),
                }),
            ),
        ).toEqual([
            {
                field: "price",
                message: `Large: with 18% GST added this is ₹1,416 to pay, more than its MRP of ₹1,300. ${WAYS_OUT}`,
            },
        ]);
    });

    it("is not judged when the row will be skipped", () => {
        expect(
            productMrpIssues(
                {
                    name: "Face cream",
                    price: "1000",
                    mrp: "1100",
                    gstRate: "18",
                },
                "face-cream",
                context(ADDED, {
                    policy: "SKIP",
                    existing: existing({}),
                }),
            ),
        ).toEqual([]);
    });
});
