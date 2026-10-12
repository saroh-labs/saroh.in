import {
    openPackDraftsWhere,
    PACK_DRAFT_HOURS,
    packExpiry,
    packLineDescription,
    packPay,
    packTermsOf,
    readPackTerms,
    sameTerms,
} from "./pack-checkout";

/**
 * A pack bought online (round-2 A11): the snapshot a draft carries and the
 * words and dates made from it. Pure; the real rows are in
 * `public-pack-purchase.service.db.spec.ts`.
 */

const PACK = {
    id: "pack_1",
    name: "10-class pack",
    credits: 10,
    validityDays: 60,
    price: { toString: () => "4500" },
    currency: "INR",
};

describe("the pack's terms, as sold", () => {
    it("takes the published columns, with the price as a two-place string", () => {
        expect(packTermsOf(PACK)).toEqual({
            packId: "pack_1",
            name: "10-class pack",
            credits: 10,
            validityDays: 60,
            price: "4500.00",
            currency: "INR",
        });
    });

    it("reads back a stored snapshot, and refuses a malformed one", () => {
        const terms = packTermsOf(PACK);
        expect(readPackTerms({ ...terms })).toEqual(terms);
        expect(readPackTerms(null)).toBeNull();
        expect(readPackTerms([])).toBeNull();
        expect(readPackTerms({ ...terms, credits: 0 })).toBeNull();
        expect(readPackTerms({ ...terms, validityDays: 1.5 })).toBeNull();
        expect(readPackTerms({ ...terms, price: "lots" })).toBeNull();
        expect(readPackTerms({ ...terms, packId: "" })).toBeNull();
    });

    it("counts two snapshots the same only when every term matches", () => {
        const terms = packTermsOf(PACK);
        expect(sameTerms(terms, { ...terms, price: "4500" })).toBe(true);
        expect(sameTerms(terms, { ...terms, price: "4600.00" })).toBe(false);
        expect(sameTerms(terms, { ...terms, credits: 12 })).toBe(false);
        expect(sameTerms(terms, { ...terms, validityDays: 30 })).toBe(false);
        expect(sameTerms(terms, { ...terms, name: "Ten classes" })).toBe(false);
        expect(sameTerms(terms, { ...terms, packId: "pack_2" })).toBe(false);
    });

    it("words the invoice line as the desk's sale does", () => {
        const terms = packTermsOf(PACK);
        expect(packLineDescription(terms)).toBe("10-class pack · 10 classes");
        expect(packLineDescription({ ...terms, credits: 1 })).toBe(
            "10-class pack · 1 class",
        );
    });

    it("runs its validity from the payment, not from when paying started", () => {
        const paid = new Date("2026-10-01T10:00:00.000Z");
        expect(packExpiry(packTermsOf(PACK), paid).toISOString()).toBe(
            "2026-11-30T10:00:00.000Z",
        );
    });
});

describe("the GST a pack is bought with (12 Oct 2026)", () => {
    /** ₹4,500 at 18% with GST added: ₹5,310 to pay (`sale-price.ts`). */
    const added = {
        pay: "5310.00",
        mode: "ADDED" as const,
        line: {
            unitPrice: "5310.00",
            gstRate: "18",
            hsnSac: "999723",
            priceMode: "ADDED" as const,
        },
    };
    /** No rate, or not registered: the price, and nothing said. */
    const plain = {
        pay: "4500.00",
        mode: null,
        line: { unitPrice: "4500.00" },
    };

    it("the snapshot keeps the typed price and the amount to pay beside it", () => {
        expect(packTermsOf(PACK, added)).toEqual({
            packId: "pack_1",
            name: "10-class pack",
            credits: 10,
            validityDays: 60,
            price: "4500.00",
            currency: "INR",
            pay: "5310.00",
            gstRate: "18",
            sacCode: "999723",
            gstPriceMode: "ADDED",
        });
        expect(packPay(packTermsOf(PACK, added))).toBe("5310.00");
    });

    it("with no GST charged, what is paid is the price, as before", () => {
        const terms = packTermsOf(PACK, plain);
        expect(terms).toMatchObject({
            price: "4500.00",
            pay: "4500.00",
            gstRate: null,
            sacCode: null,
            gstPriceMode: null,
        });
        expect(packPay(terms)).toBe("4500.00");
    });

    it("a draft from before packs carried GST pays its price", () => {
        const old = readPackTerms({ ...packTermsOf(PACK) });
        expect(old).not.toHaveProperty("pay");
        expect(old && packPay(old)).toBe("4500.00");
    });

    it("reads the GST back from a stored snapshot, dropping anything malformed", () => {
        const terms = packTermsOf(PACK, added);
        expect(readPackTerms({ ...terms })).toEqual(terms);
        const odd = readPackTerms({
            ...terms,
            pay: "lots",
            gstPriceMode: "SOMETIMES",
        });
        expect(odd).not.toHaveProperty("pay");
        expect(odd).not.toHaveProperty("gstPriceMode");
    });

    it("a rate set, or the choice changed, since paying started is not the same terms: the draft is started again", () => {
        const before = packTermsOf(PACK, plain);
        expect(sameTerms(before, packTermsOf(PACK, plain))).toBe(true);
        expect(sameTerms(before, packTermsOf(PACK, added))).toBe(false);
        // The same amount under another rate or mode is still a new paper.
        const included = packTermsOf(PACK, {
            pay: "4500.00",
            mode: "INCLUDED",
            line: {
                unitPrice: "4500.00",
                gstRate: "18",
                hsnSac: null,
                priceMode: "INCLUDED",
            },
        });
        expect(sameTerms(before, included)).toBe(false);
        // A draft from before the field existed matches one with no GST.
        expect(sameTerms(packTermsOf(PACK), before)).toBe(true);
    });
});

describe("an account's open pack payments", () => {
    it("are its own unnumbered PACK drafts from the last 24 hours", () => {
        const now = new Date("2026-10-02T10:00:00.000Z");
        expect(openPackDraftsWhere("org_1", "contact_1", now)).toEqual({
            organizationId: "org_1",
            contactId: "contact_1",
            kind: "INVOICE",
            source: "PACK",
            status: "DRAFT",
            number: null,
            createdAt: {
                gt: new Date(now.getTime() - PACK_DRAFT_HOURS * 3_600_000),
            },
        });
    });
});
