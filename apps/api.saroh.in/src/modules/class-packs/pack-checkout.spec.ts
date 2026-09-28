import {
    openPackDraftsWhere,
    PACK_DRAFT_HOURS,
    packExpiry,
    packLineDescription,
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
