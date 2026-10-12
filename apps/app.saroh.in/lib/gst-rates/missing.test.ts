import { describe, expect, it } from "vitest";

import { toFailure } from "@/lib/api/failure";

import type { MissingRates, RateRow } from "./missing";
import {
    askWhy,
    chosenRates,
    kindWord,
    listNote,
    listWhy,
    missingLine,
    rateItemsOf,
    rateKey,
    rowName,
    savedMessage,
    savedWhere,
    unchosen,
} from "./missing";

const PT = {
    kind: "SERVICE",
    id: "svc_pt",
    name: "Personal Training",
} as const;
const SERUM = {
    kind: "PRODUCT",
    id: "prod_1",
    name: "Vitamin C serum",
} as const;
const LINE = { kind: "LINE", id: "1", name: "Catering, Saturday" } as const;

describe("rateItemsOf", () => {
    it("reads the items a refusal names", () => {
        expect(
            rateItemsOf({ reason: "GST_RATE_MISSING", items: [PT, LINE] }),
        ).toEqual([PT, LINE]);
    });

    it("is undefined for any other refusal, so it is shown as it always was", () => {
        expect(rateItemsOf(undefined)).toBeUndefined();
        expect(rateItemsOf({ field: "lines" })).toBeUndefined();
        expect(
            rateItemsOf({ reason: "BUSINESS_DETAILS_MISSING", missing: [] }),
        ).toBeUndefined();
        expect(
            rateItemsOf({ reason: "GST_RATE_MISSING", items: [] }),
        ).toBeUndefined();
    });

    it("drops what it can't use, and keeps a nameless item", () => {
        expect(
            rateItemsOf({
                reason: "GST_RATE_MISSING",
                items: [
                    { kind: "COURSE", id: "c_1", name: "Yoga course" },
                    { kind: "SERVICE", name: "No id" },
                    null,
                    { kind: "PRODUCT", id: "p_2" },
                ],
            }),
        ).toEqual([{ kind: "PRODUCT", id: "p_2", name: "" }]);
    });

    it("reaches the client on a failure, in the API's envelope", () => {
        const failure = toFailure(
            {
                error: {
                    message:
                        "Personal Training has no GST rate. Choose one to issue this invoice.",
                    details: { reason: "GST_RATE_MISSING", items: [PT] },
                },
            },
            "Couldn't record the payment",
        );
        expect(failure).toEqual({
            ok: false,
            error: "Personal Training has no GST rate. Choose one to issue this invoice.",
            rates: [PT],
        });
    });
});

describe("the sheet's draft", () => {
    const rows: RateRow[] = [PT, SERUM, { ...LINE, canSet: false }];

    it("keys a service and a product apart, even with one id", () => {
        expect(rateKey({ kind: "SERVICE", id: "x" })).not.toBe(
            rateKey({ kind: "PRODUCT", id: "x" }),
        );
    });

    it("sends only what was chosen, 0% included, in the rows' order", () => {
        expect(
            chosenRates(rows, {
                [rateKey(SERUM)]: "0",
                [rateKey(PT)]: "18",
                [rateKey(LINE)]: "",
            }),
        ).toEqual([
            { kind: "SERVICE", id: "svc_pt", rate: "18" },
            { kind: "PRODUCT", id: "prod_1", rate: "0" },
        ]);
    });

    it("says what is still to choose, leaving out what this role can't set", () => {
        expect(unchosen(rows, { [rateKey(PT)]: "5" })).toEqual([SERUM]);
        expect(unchosen(rows, {})).toEqual([PT, SERUM]);
    });
});

describe("the words", () => {
    it("names one item and what was started", () => {
        expect(askWhy([PT], "issue this invoice")).toBe(
            "Personal Training has no GST rate. Choose one to issue this invoice.",
        );
        expect(askWhy([PT], "take this payment")).toBe(
            "Personal Training has no GST rate. Choose one to take this payment.",
        );
    });

    it("counts several", () => {
        expect(askWhy([PT, SERUM, LINE], "take this payment")).toBe(
            "3 items have no GST rate. Choose one for each to take this payment.",
        );
    });

    it("never prints a blank name", () => {
        expect(rowName({ kind: "LINE", name: " " })).toBe("This line");
        expect(askWhy([{ ...LINE, name: "" }], "issue this invoice")).toBe(
            "This line has no GST rate. Choose one to issue this invoice.",
        );
    });

    it("says where the choice is kept", () => {
        expect(savedWhere([PT])).toBe(
            "The rate is saved on the service, so you're asked once. Prices include GST. Choose 0% for anything exempt or nil-rated.",
        );
        expect(savedWhere([SERUM])).toContain("saved on the product");
        expect(savedWhere([PT, SERUM])).toContain(
            "Each rate is saved on its item",
        );
        expect(savedWhere([LINE])).toContain("saved on this invoice");
    });

    it("says how the prices carry GST as the business chose, and nothing when that isn't known", () => {
        expect(savedWhere([PT], "ADDED")).toBe(
            "The rate is saved on the service, so you're asked once. GST is added to your prices. Choose 0% for anything exempt or nil-rated.",
        );
        expect(savedWhere([PT, SERUM], "INCLUDED")).toBe(
            "Each rate is saved on its item, so you're asked once. Prices include GST. Choose 0% for anything exempt or nil-rated.",
        );
        expect(savedWhere([SERUM], null)).toBe(
            "The rate is saved on the product, so you're asked once. Choose 0% for anything exempt or nil-rated.",
        );
        // A line typed on an invoice is charged as typed, whatever the
        // business chose for its services and products.
        expect(savedWhere([LINE], "ADDED")).toBe(
            "The rate is saved on this invoice. Prices include GST. Choose 0% for anything exempt or nil-rated.",
        );
        expect(savedWhere([LINE], null)).toContain("Prices include GST.");
    });

    it("the list's sheet says the same, by the business's choice", () => {
        expect(listNote("INCLUDED", false)).toBe(
            "Prices include GST. Choose 0% for anything exempt or nil-rated.",
        );
        expect(listNote("ADDED", false)).toBe(
            "GST is added to your prices. Choose 0% for anything exempt or nil-rated.",
        );
        expect(listNote(null, false)).toBe(
            "Choose 0% for anything exempt or nil-rated.",
        );
        expect(listNote("ADDED", true)).toBe(
            "There are more than this list holds. Save these and the rest are listed next. Choose 0% for anything exempt or nil-rated.",
        );
        expect(listWhy("INCLUDED")).toBe(
            "These are on sale with a price and no GST rate. Choose the rate each price includes.",
        );
        expect(listWhy("ADDED")).toBe(
            "These are on sale with a price and no GST rate. Choose the rate added to each price.",
        );
        expect(listWhy(null)).toBe(
            "These are on sale with a price and no GST rate. Choose each one's rate.",
        );
    });

    it("names each kind", () => {
        expect(kindWord("SERVICE")).toBe("Service");
        expect(kindWord("PRODUCT")).toBe("Product");
        expect(kindWord("LINE")).toBe("Invoice line");
    });

    it("says how many were saved", () => {
        expect(savedMessage(1)).toBe("GST rate saved.");
        expect(savedMessage(3)).toBe("3 GST rates saved.");
    });
});

describe("the notice's line", () => {
    const missing = (
        items: MissingRates["items"],
        over: Partial<MissingRates> = {},
    ): MissingRates => ({ registered: true, items, more: false, ...over });

    it("is nothing when nothing is missing, unregistered, or unread", () => {
        expect(missingLine(null)).toBeNull();
        expect(missingLine(missing([]))).toBeNull();
        expect(missingLine(missing([PT], { registered: false }))).toBeNull();
    });

    it("counts by kind, with the verb and the pronoun agreeing", () => {
        expect(missingLine(missing([PT]))).toBe(
            "1 service has no GST rate. Until you choose one, its tax invoices show no GST.",
        );
        expect(missingLine(missing([PT, SERUM, { ...SERUM, id: "p_2" }]))).toBe(
            "1 service and 2 products have no GST rate. Until you choose one, their tax invoices show no GST.",
        );
    });

    it("says so when there are more than the list holds", () => {
        expect(missingLine(missing([PT, SERUM], { more: true }))).toBe(
            "More than 1 service and 1 product have no GST rate. Until you choose one, their tax invoices show no GST.",
        );
    });
});
