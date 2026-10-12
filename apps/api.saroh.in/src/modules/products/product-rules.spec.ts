import { BadRequestException } from "@nestjs/common";

import type { PriceTerms } from "../invoices/gst-price";
import type { MrpGst } from "./product-rules";
import {
    assertDetailsCoherent,
    assertMrpAtOrAbovePrice,
    assertProductWithinMrp,
    cleanShopFields,
    firstOverMrp,
    hasMrp,
    moneyToCents,
    mrpSaving,
    overMrp,
    overMrpMessage,
    productOverMrp,
} from "./product-rules";

describe("product rules", () => {
    it("reads money strings as whole minor units", () => {
        expect(moneyToCents("799")).toBe(79_900);
        expect(moneyToCents("24.5")).toBe(2_450);
        expect(moneyToCents("0.05")).toBe(5);
    });

    it("refuses an MRP below the price and allows one at or above it", () => {
        expect(() => assertMrpAtOrAbovePrice("799", "700")).toThrow(
            BadRequestException,
        );
        expect(() => assertMrpAtOrAbovePrice("799", "799")).not.toThrow();
        expect(() => assertMrpAtOrAbovePrice("799", "999")).not.toThrow();
        expect(() => assertMrpAtOrAbovePrice("799", null)).not.toThrow();
    });

    it("keeps only known shop switches, and only booleans", () => {
        expect(cleanShopFields({ howToUse: false, returns: true })).toEqual({
            howToUse: false,
            returns: true,
        });
        expect(() => cleanShopFields({ supplierCode: true })).toThrow(
            BadRequestException,
        );
        expect(() => cleanShopFields({ maker: "yes" })).toThrow(
            BadRequestException,
        );
    });

    it("asks who made it, and for the own returns rule", () => {
        const ok = {
            madeHere: true,
            maker: null,
            returnsMode: "STOREFRONT",
            returnsText: null,
        };
        expect(() => assertDetailsCoherent(ok)).not.toThrow();
        expect(() => assertDetailsCoherent({ ...ok, madeHere: false })).toThrow(
            /who makes it/,
        );
        expect(() =>
            assertDetailsCoherent({ ...ok, madeHere: false, maker: "Kama" }),
        ).not.toThrow();
        expect(() =>
            assertDetailsCoherent({ ...ok, returnsMode: "OWN" }),
        ).toThrow(/returns rule/);
    });
});

/**
 * GST is part of MRP (the owner, 12 Oct 2026). An MRP includes all taxes,
 * so it is compared with the amount the customer pays for one, GST and all
 * (`invoices/gst-price.ts`), never with the typed price before GST.
 */
describe("GST is part of MRP", () => {
    const REGISTERED_INCLUDED: PriceTerms = {
        registered: true,
        mode: "INCLUDED",
    };
    const REGISTERED_ADDED: PriceTerms = { registered: true, mode: "ADDED" };
    const UNREGISTERED: PriceTerms = { registered: false, mode: "INCLUDED" };

    /** A product at `rate` percent, priced the business's way unless told. */
    const under = (
        terms: PriceTerms,
        rate: string | null = "18",
        own: string | null = null,
    ): MrpGst => ({
        item: { gstRate: rate, gstPriceMode: own },
        terms,
        currency: "INR",
    });

    /** What the refusal says and where, or null when it is allowed. */
    const refusal = (
        price: string,
        mrp: string | null,
        gst?: MrpGst,
        field = "mrp",
    ): { message: string; field: string } | null => {
        try {
            assertMrpAtOrAbovePrice(price, mrp, field, gst);
            return null;
        } catch (error) {
            if (!(error instanceof BadRequestException)) throw error;
            return error.getResponse() as { message: string; field: string };
        }
    };

    const WAYS_OUT =
        "Lower the price, raise the MRP, or set this product's price to include GST.";

    describe("prices include GST: unchanged", () => {
        it("compares the typed price with the MRP, in the words it always had", () => {
            const gst = under(REGISTERED_INCLUDED);
            // ₹1,000 with 18% inside is ₹1,000 to pay.
            expect(refusal("1000", "1100", gst)).toBeNull();
            expect(refusal("1000", "1000", gst)).toBeNull();
            expect(refusal("1000", "999.99", gst)).toEqual({
                message: "MRP can't be lower than the price it sells for.",
                field: "mrp",
            });
        });

        it("is the same answer as with no GST given at all", () => {
            for (const [price, mrp] of [
                ["799", "700"],
                ["799", "799"],
                ["799", "999"],
                ["1000", "1179.99"],
            ] as const) {
                expect(refusal(price, mrp, under(REGISTERED_INCLUDED))).toEqual(
                    refusal(price, mrp),
                );
            }
        });
    });

    describe("GST is added", () => {
        it("18%: ₹1,000 is ₹1,180 to pay. Refused above the MRP, allowed at exactly the MRP and below it", () => {
            const gst = under(REGISTERED_ADDED, "18");
            // 1,000 + 180 = 1,180 > 1,100
            expect(refusal("1000", "1100", gst)).toEqual({
                message: `With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
                field: "mrp",
            });
            // One paisa short of the amount to pay.
            expect(refusal("1000", "1179.99", gst)?.message).toBe(
                `With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,179.99. ${WAYS_OUT}`,
            );
            // 1,180 = 1,180
            expect(refusal("1000", "1180", gst)).toBeNull();
            // 1,180 < 1,200
            expect(refusal("1000", "1200", gst)).toBeNull();
        });

        it("5%: ₹1,000 is ₹1,050 to pay", () => {
            const gst = under(REGISTERED_ADDED, "5");
            // 1,000 + 50 = 1,050
            expect(refusal("1000", "1049.99", gst)?.message).toBe(
                `With 5% GST added this is ₹1,050 to pay, more than its MRP of ₹1,049.99. ${WAYS_OUT}`,
            );
            expect(refusal("1000", "1050", gst)).toBeNull();
            expect(refusal("1000", "1051", gst)).toBeNull();
        });

        it("12%: ₹1,000 is ₹1,120 to pay", () => {
            const gst = under(REGISTERED_ADDED, "12");
            // 1,000 + 120 = 1,120
            expect(refusal("1000", "1100", gst)?.message).toBe(
                `With 12% GST added this is ₹1,120 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
            );
            expect(refusal("1000", "1120", gst)).toBeNull();
            expect(refusal("1000", "1150", gst)).toBeNull();
        });

        it("28%: ₹1,000 is ₹1,280 to pay", () => {
            const gst = under(REGISTERED_ADDED, "28");
            // 1,000 + 280 = 1,280
            expect(refusal("1000", "1279", gst)?.message).toBe(
                `With 28% GST added this is ₹1,280 to pay, more than its MRP of ₹1,279. ${WAYS_OUT}`,
            );
            expect(refusal("1000", "1280", gst)).toBeNull();
            expect(refusal("1000", "1300", gst)).toBeNull();
        });

        it("rounds the GST to the paisa, half up, before it compares", () => {
            const gst = under(REGISTERED_ADDED, "18");
            // 99.99 × 18% = 17.9982 → 18.00; 99.99 + 18.00 = 117.99
            expect(refusal("99.99", "117.99", gst)).toBeNull();
            expect(refusal("99.99", "117.98", gst)?.message).toBe(
                `With 18% GST added this is ₹117.99 to pay, more than its MRP of ₹117.98. ${WAYS_OUT}`,
            );
            // 49.50 × 5% = 2.475 → 2.48; 49.50 + 2.48 = 51.98
            const five = under(REGISTERED_ADDED, "5");
            expect(refusal("49.50", "51.98", five)).toBeNull();
            expect(refusal("49.50", "51.97", five)).not.toBeNull();
        });

        it("a typed price itself above the MRP says what it always said", () => {
            expect(
                refusal("1200", "1100", under(REGISTERED_ADDED))?.message,
            ).toBe("MRP can't be lower than the price it sells for.");
        });

        it("names the field it was asked to", () => {
            expect(
                refusal("1000", "1100", under(REGISTERED_ADDED), "price")
                    ?.field,
            ).toBe("price");
        });

        it("adds nothing with no rate, or at 0%: the typed price is compared", () => {
            expect(
                refusal("1000", "1000", under(REGISTERED_ADDED, null)),
            ).toBeNull();
            expect(
                refusal("1000", "1000", under(REGISTERED_ADDED, "0")),
            ).toBeNull();
            expect(
                refusal("1000", "999", under(REGISTERED_ADDED, "0"))?.message,
            ).toBe("MRP can't be lower than the price it sells for.");
        });

        it("says the sums in the product's own currency", () => {
            expect(
                refusal("10", "11", {
                    ...under(REGISTERED_ADDED, "18"),
                    currency: "USD",
                })?.message,
            ).toBe(
                `With 18% GST added this is $11.80 to pay, more than its MRP of $11. ${WAYS_OUT}`,
            );
        });
    });

    describe("the product's own choice, both ways", () => {
        it("GST is added on this product, in a business whose prices include GST: judged by the amount to pay", () => {
            const gst = under(REGISTERED_INCLUDED, "18", "ADDED");
            expect(refusal("1000", "1100", gst)?.message).toBe(
                `With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
            );
            expect(refusal("1000", "1180", gst)).toBeNull();
        });

        it("Includes GST on this product, in a business that adds GST: judged by the typed price", () => {
            const gst = under(REGISTERED_ADDED, "18", "INCLUDED");
            expect(refusal("1000", "1100", gst)).toBeNull();
            expect(refusal("1000", "1000", gst)).toBeNull();
            expect(refusal("1000", "999", gst)?.message).toBe(
                "MRP can't be lower than the price it sells for.",
            );
        });
    });

    describe("a business that isn't registered is untouched", () => {
        it("pays the typed price whatever a rate or a stored choice says", () => {
            for (const gst of [
                under(UNREGISTERED, "18"),
                under(UNREGISTERED, "18", "ADDED"),
                under({ registered: false, mode: "ADDED" }, "28"),
            ]) {
                expect(refusal("1000", "1100", gst)).toBeNull();
                expect(refusal("1000", "1000", gst)).toBeNull();
                expect(refusal("1000", "999", gst)?.message).toBe(
                    "MRP can't be lower than the price it sells for.",
                );
            }
        });
    });

    describe("what is found", () => {
        it("carries the sums: typed, to pay, the MRP and the rate added", () => {
            expect(overMrp("1000", "1100", under(REGISTERED_ADDED))).toEqual({
                option: null,
                listCents: 100_000,
                payCents: 118_000,
                mrpCents: 110_000,
                addedRate: "18",
            });
            expect(overMrp("1000", "999", under(REGISTERED_INCLUDED))).toEqual({
                option: null,
                listCents: 100_000,
                payCents: 100_000,
                mrpCents: 99_900,
                addedRate: null,
            });
            expect(overMrp("1000", null, under(REGISTERED_ADDED))).toBeNull();
            expect(overMrp("1000", "1180", under(REGISTERED_ADDED))).toBeNull();
        });

        it("names an option in front of the same sums", () => {
            const over = overMrp("1000", "1100", {
                ...under(REGISTERED_ADDED),
                option: "Large",
            });
            expect(over && overMrpMessage(over, "INR")).toBe(
                `Large: with 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. ${WAYS_OUT}`,
            );
            // Its typed price is itself above the MRP: ₹1,200 + 18% = ₹1,416.
            const above = overMrp("1200", "1100", {
                ...under(REGISTERED_ADDED),
                option: "Large",
            });
            expect(above && overMrpMessage(above, "INR")).toBe(
                "Large is ₹1,416 to pay, more than its MRP of ₹1,100. Lower its price or raise the MRP.",
            );
        });
    });

    describe("a product with options", () => {
        const product = {
            price: "1000",
            mrp: "1200",
            gstRate: "18",
            gstPriceMode: null,
            variants: [
                // Sells as the product does: the product's own finding.
                { title: "Small", price: null, mrp: null },
                // Its own price under the product's MRP: 1,050 + 189 = 1,239.
                { title: "Medium", price: "1050", mrp: null },
                // Its own MRP under the product's price: 1,180 against 1,100.
                { title: "Large", price: null, mrp: "1100" },
                // Its own price and MRP: 500 + 90 = 590 against 590.
                { title: "Travel", price: "500", mrp: "590" },
            ],
        };

        it("finds each option over its MRP once GST is added, its own MRP else the product's", () => {
            expect(productOverMrp(product, REGISTERED_ADDED)).toEqual([
                {
                    option: "Medium",
                    listCents: 105_000,
                    payCents: 123_900,
                    mrpCents: 120_000,
                    addedRate: "18",
                },
                {
                    option: "Large",
                    listCents: 100_000,
                    payCents: 118_000,
                    mrpCents: 110_000,
                    addedRate: "18",
                },
            ]);
        });

        it("finds none of them while prices include GST, or for a business that isn't registered", () => {
            expect(productOverMrp(product, REGISTERED_INCLUDED)).toEqual([]);
            expect(productOverMrp(product, UNREGISTERED)).toEqual([]);
        });

        it("refuses the product's own write for the first option GST takes over its MRP, by name", () => {
            expect(firstOverMrp(product, REGISTERED_ADDED)?.option).toBe(
                "Medium",
            );
            let said: unknown;
            try {
                assertProductWithinMrp(
                    product,
                    REGISTERED_ADDED,
                    "INR",
                    "gstRate",
                );
            } catch (error) {
                said = (error as BadRequestException).getResponse();
            }
            expect(said).toEqual({
                message: `Medium: with 18% GST added this is ₹1,239 to pay, more than its MRP of ₹1,200. ${WAYS_OUT}`,
                field: "gstRate",
            });
        });

        it("the product's own price comes first, and passes at exactly its MRP", () => {
            // 1,000 + 180 = 1,180 against 1,180: allowed.
            expect(
                firstOverMrp(
                    { ...product, mrp: "1180", variants: [] },
                    REGISTERED_ADDED,
                ),
            ).toBeNull();
            // Against 1,179: the product's own, before any option.
            expect(
                firstOverMrp({ ...product, mrp: "1179" }, REGISTERED_ADDED)
                    ?.option,
            ).toBeNull();
        });

        it("leaves an option whose typed price is above its MRP to its own form while prices include GST", () => {
            // ₹1,300 typed against the product's MRP of ₹1,200, no GST on
            // top: found, but not what a product's own write is refused for.
            const odd = {
                ...product,
                variants: [{ title: "XL", price: "1300", mrp: null }],
            };
            expect(productOverMrp(odd, REGISTERED_INCLUDED)).toHaveLength(1);
            expect(productOverMrp(odd, REGISTERED_INCLUDED, true)).toEqual([]);
            expect(firstOverMrp(odd, REGISTERED_INCLUDED)).toBeNull();
        });

        it("knows whether there is an MRP to be over at all", () => {
            expect(hasMrp({ mrp: null, variants: [] })).toBe(false);
            expect(hasMrp({ mrp: "10" })).toBe(true);
            expect(
                hasMrp({
                    mrp: null,
                    variants: [{ title: "L", price: null, mrp: "10" }],
                }),
            ).toBe(true);
        });
    });

    describe("the saving is true", () => {
        it("is the MRP against the amount to pay, rounded down", () => {
            // 999 - 799 = 200; 200 / 999 = 20.02% → 20
            expect(mrpSaving(79_900, "999")).toEqual({
                mrp: "999.00",
                percent: 20,
            });
            // 999 - 649 = 350; 350 / 999 = 35.03% → 35, never 36
            expect(mrpSaving(64_900, "999")?.percent).toBe(35);
            // GST added: 1,475 - 1,180 = 295; 295 / 1,475 = 20%. Against
            // the typed ₹1,000 it would have been 32%.
            expect(mrpSaving(118_000, "1475.00")).toEqual({
                mrp: "1475.00",
                percent: 20,
            });
        });

        it("is none at the MRP, above it, or with no MRP", () => {
            expect(mrpSaving(118_000, "1180")).toBeNull();
            expect(mrpSaving(118_000, "1100")).toBeNull();
            expect(mrpSaving(79_900, null)).toBeNull();
            expect(mrpSaving(0, "0")).toBeNull();
        });

        it("under one whole percent is a saving of 0: the MRP is still above what is paid", () => {
            expect(mrpSaving(100_000, "1001")).toEqual({
                mrp: "1001.00",
                percent: 0,
            });
        });
    });
});
