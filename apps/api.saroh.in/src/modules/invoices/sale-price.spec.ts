// What a membership plan, a class pack or a course is charged (12 Oct
// 2026): `saleCharge` turns its typed price into the amount to pay by the
// one rule in `gst-price.ts`, and says what its invoice line carries. Pure;
// every sum is written out in paise.
import "reflect-metadata";

import type { PriceTerms } from "./gst-price";
import { buildManualInvoice } from "./order-invoice";
import {
    hasRate,
    priceTermsFor,
    saleCharge,
    saleChargeInTx,
} from "./sale-price";

const includes: PriceTerms = { registered: true, mode: "INCLUDED" };
const added: PriceTerms = { registered: true, mode: "ADDED" };
const notRegistered: PriceTerms = { registered: false, mode: "ADDED" };

/** A stored `Decimal(5, 2)` reads back like this. */
const decimal = (s: string) => ({ toString: () => s });

describe("whether a rate was chosen", () => {
    it("null and absent are not set; 0 is a rate", () => {
        expect(hasRate(null)).toBe(false);
        expect(hasRate(undefined)).toBe(false);
        expect(hasRate({})).toBe(false);
        expect(hasRate({ gstRate: null })).toBe(false);
        expect(hasRate({ gstRate: "0" })).toBe(true);
        expect(hasRate({ gstRate: decimal("0.00") })).toBe(true);
        expect(hasRate({ gstRate: "18" })).toBe(true);
    });
});

describe("no rate, or not registered: unchanged to the paisa", () => {
    const plain = {
        listCents: 200_000,
        payCents: 200_000,
        pay: "2000.00",
        mode: null,
        gst: null,
        // The line written before plans, packs and courses carried a rate:
        // its unit price and nothing else.
        line: { unitPrice: "2000.00" },
    };

    it("a registered business's item with no rate pays the typed price, under either choice", () => {
        expect(saleCharge(200_000, { gstRate: null }, includes)).toEqual(plain);
        expect(saleCharge(200_000, { gstRate: null }, added)).toEqual(plain);
        expect(saleCharge(200_000, null, added)).toEqual(plain);
        expect(saleCharge(200_000, undefined, added)).toEqual(plain);
    });

    it("its own 'GST is added' adds nothing while no rate is chosen", () => {
        expect(
            saleCharge(
                200_000,
                { gstRate: null, gstPriceMode: "ADDED", sacCode: "999723" },
                includes,
            ),
        ).toEqual(plain);
    });

    it("a business that is not registered pays the typed price whatever the item says, and its line carries no rate", () => {
        expect(
            saleCharge(
                200_000,
                { gstRate: "18", gstPriceMode: "ADDED", sacCode: "999723" },
                notRegistered,
            ),
        ).toEqual(plain);
    });

    it("keeps odd paise as typed", () => {
        expect(saleCharge(199_999, { gstRate: null }, added).pay).toBe(
            "1999.99",
        );
    });
});

describe("includes GST: the amount stays, the split shows", () => {
    it("₹2,000 at 18% is ₹2,000 to pay, ₹305.08 of it GST", () => {
        const charge = saleCharge(
            200_000,
            { gstRate: decimal("18.00"), sacCode: "999723" },
            includes,
        );
        expect(charge).toEqual({
            listCents: 200_000,
            payCents: 200_000,
            pay: "2000.00",
            mode: "INCLUDED",
            gst: {
                mode: "INCLUDED",
                rate: "18",
                listCents: 200_000,
                gstCents: 30_508,
                payCents: 200_000,
            },
            line: {
                unitPrice: "2000.00",
                gstRate: "18",
                hsnSac: "999723",
                priceMode: "INCLUDED",
            },
        });
    });

    it("the invoice built from the line carries ₹1,694.92 + ₹152.54 + ₹152.54", () => {
        const charge = saleCharge(200_000, { gstRate: "18" }, includes);
        const doc = buildManualInvoice(
            [
                {
                    description: "Gym monthly",
                    quantity: 1,
                    unitCents: charge.payCents,
                    rateBps: 1800,
                    code: null,
                    priceMode: charge.mode,
                },
            ],
            {
                registered: true,
                gstin: "29ABCDE1234F1Z5",
                state: "29",
                address: null,
                seller: {
                    sellerName: "Pulse",
                    sellerLegalName: null,
                    sellerEmail: null,
                },
            },
            null,
            0,
        );
        expect(doc.totalCents).toBe(200_000);
        expect(doc.lines[0]).toMatchObject({
            amountCents: 200_000,
            taxableCents: 169_492,
            cgstCents: 15_254,
            sgstCents: 15_254,
            igstCents: 0,
            priceMode: "INCLUDED",
        });
    });
});

describe("GST is added: the price plus its GST", () => {
    it("₹2,000 at 18% is ₹2,360 to pay", () => {
        expect(saleCharge(200_000, { gstRate: "18" }, added)).toEqual({
            listCents: 200_000,
            payCents: 236_000,
            pay: "2360.00",
            mode: "ADDED",
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 200_000,
                gstCents: 36_000,
                payCents: 236_000,
            },
            line: {
                unitPrice: "2360.00",
                gstRate: "18",
                hsnSac: null,
                priceMode: "ADDED",
            },
        });
    });

    it("the invoice built from the line is ₹2,000 + ₹180 + ₹180, and totals what was charged", () => {
        const charge = saleCharge(200_000, { gstRate: "18" }, added);
        const doc = buildManualInvoice(
            [
                {
                    description: "Gym monthly",
                    quantity: 1,
                    unitCents: charge.payCents,
                    rateBps: 1800,
                    code: null,
                    priceMode: charge.mode,
                },
            ],
            {
                registered: true,
                gstin: "29ABCDE1234F1Z5",
                state: "29",
                address: null,
                seller: {
                    sellerName: "Pulse",
                    sellerLegalName: null,
                    sellerEmail: null,
                },
            },
            null,
            0,
        );
        expect(doc.totalCents).toBe(236_000);
        expect(doc.lines[0]).toMatchObject({
            amountCents: 236_000,
            taxableCents: 200_000,
            cgstCents: 18_000,
            sgstCents: 18_000,
            priceMode: "ADDED",
        });
    });

    it.each([
        // typed, rate, to pay
        [450_000, "18", 531_000], // ₹4,500 pack → ₹5,310
        [600_000, "5", 630_000], // ₹6,000 course → ₹6,300
        [199_999, "18", 235_999], // 35,999.82 paise of GST → 36,000
        [33_333, "18", 39_333], // 5,999.94 → 6,000
        [100, "0.25", 100], // ₹1 at 0.25%: 0.25 paise → 0
        [200, "0.25", 201], // ₹2 at 0.25%: 0.5 paise → 1 (half up)
        [250_000, "28", 320_000],
        [250_000, "40", 350_000],
    ])("%i paise at %s%% is %i paise to pay", (list, rate, pay) => {
        expect(saleCharge(list, { gstRate: rate }, added).payCents).toBe(pay);
    });

    it("an exempt item (0%) pays the typed price, says nothing about GST, and its line carries the 0 rate", () => {
        expect(
            saleCharge(200_000, { gstRate: decimal("0.00") }, added),
        ).toEqual({
            listCents: 200_000,
            payCents: 200_000,
            pay: "2000.00",
            mode: null,
            gst: null,
            line: {
                unitPrice: "2000.00",
                gstRate: "0",
                hsnSac: null,
                priceMode: null,
            },
        });
    });
});

describe("the item's own choice", () => {
    it("is used over the business's, either way", () => {
        expect(
            saleCharge(
                200_000,
                { gstRate: "18", gstPriceMode: "ADDED" },
                includes,
            ).payCents,
        ).toBe(236_000);
        expect(
            saleCharge(
                200_000,
                { gstRate: "18", gstPriceMode: "INCLUDED" },
                added,
            ).payCents,
        ).toBe(200_000);
    });

    it("null, or anything unknown, is the business's", () => {
        expect(
            saleCharge(200_000, { gstRate: "18", gstPriceMode: null }, added)
                .payCents,
        ).toBe(236_000);
        expect(
            saleCharge(
                200_000,
                { gstRate: "18", gstPriceMode: "WHATEVER" },
                added,
            ).payCents,
        ).toBe(236_000);
    });

    it("a blank SAC code is none", () => {
        expect(
            saleCharge(200_000, { gstRate: "18", sacCode: "  " }, added).line
                .hsnSac,
        ).toBeNull();
    });
});

describe("reading the business's terms", () => {
    const profile = {
        gstRegistered: true,
        taxId: "29ABCDE1234F1Z5",
        gstState: "29",
        gstPriceMode: "ADDED",
    };
    const db = () => ({
        businessProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    });

    it("reads nothing for an item with no rate: there is nothing to work out", async () => {
        const client = db();
        const charge = await saleChargeInTx(client as never, "org_1", 200_000, {
            gstRate: null,
        });
        expect(charge.pay).toBe("2000.00");
        expect(client.businessProfile.findUnique).not.toHaveBeenCalled();
    });

    it("reads them for an item with a rate, and charges by them", async () => {
        const client = db();
        const charge = await saleChargeInTx(client as never, "org_1", 200_000, {
            gstRate: "18",
        });
        expect(charge.pay).toBe("2360.00");
        expect(client.businessProfile.findUnique).toHaveBeenCalledTimes(1);
    });

    it("a business with the switch on and no GSTIN on file is not registered: the paper would leave the GST out", async () => {
        const client = {
            businessProfile: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue({ ...profile, taxId: null }),
            },
        };
        const charge = await saleChargeInTx(client as never, "org_1", 200_000, {
            gstRate: "18",
        });
        expect(charge.pay).toBe("2000.00");
        expect(charge.gst).toBeNull();
    });

    it("a list reads them once when anything has a rate, and not at all otherwise", async () => {
        const none = db();
        await expect(
            priceTermsFor(none as never, "org_1", [{ gstRate: null }, {}]),
        ).resolves.toEqual({ registered: false, mode: "INCLUDED" });
        expect(none.businessProfile.findUnique).not.toHaveBeenCalled();

        const some = db();
        await expect(
            priceTermsFor(some as never, "org_1", [
                { gstRate: null },
                { gstRate: "0" },
            ]),
        ).resolves.toEqual({ registered: true, mode: "ADDED" });
        expect(some.businessProfile.findUnique).toHaveBeenCalledTimes(1);
    });
});
