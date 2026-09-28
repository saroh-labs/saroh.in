import { describe, expect, it } from "vitest";

import {
    changeAccess,
    differenceNote,
    moneyText,
    parseCharge,
    prefillCharge,
    saveLabel,
} from "./fulfilment-change";

const format = (cents: number) =>
    `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

describe("prefillCharge — where the delivery charge starts (B9)", () => {
    it("keeps the order's charge between delivery types", () => {
        expect(prefillCharge("LOCAL_DELIVERY", "SHIPPING", 40)).toBe("40");
        expect(prefillCharge("SHIPPING", "LOCAL_DELIVERY", 60.5)).toBe("60.50");
    });

    it("is nothing for Pick-up or Digital", () => {
        expect(prefillCharge("LOCAL_DELIVERY", "PICKUP", 40)).toBe("0");
        expect(prefillCharge("PICKUP", "DIGITAL", 0)).toBe("0");
    });

    it("is left for staff to type when an order becomes a delivery", () => {
        expect(prefillCharge("PICKUP", "LOCAL_DELIVERY", 0)).toBe("");
    });
});

describe("parseCharge — the typed charge", () => {
    it("takes whole and two-decimal money, and zero", () => {
        expect(parseCharge("40")).toEqual({
            kind: "ok",
            cents: 4000,
            money: "40.00",
        });
        expect(parseCharge(" 40.5 ")).toMatchObject({ cents: 4050 });
        expect(parseCharge("0")).toMatchObject({ kind: "ok", cents: 0 });
    });

    it("refuses anything else, and knows an empty field", () => {
        expect(parseCharge("")).toEqual({ kind: "empty" });
        expect(parseCharge("-5")).toMatchObject({ kind: "bad" });
        expect(parseCharge("4.555")).toMatchObject({ kind: "bad" });
        expect(parseCharge("forty")).toMatchObject({ kind: "bad" });
    });
});

describe("differenceNote — what saving does to the money", () => {
    const base = {
        first: "Asha",
        refundTo: "Razorpay",
        linkable: true,
        format,
    };

    it("paid online: more is owed by a pay link, less goes back", () => {
        expect(
            differenceNote({ ...base, differenceCents: 4000, paid: "online" }),
        ).toBe("₹40 more to pay. Saving makes a pay link for it to send Asha.");
        expect(
            differenceNote({
                ...base,
                differenceCents: 4000,
                paid: "online",
                linkable: false,
            }),
        ).toBe("₹40 more to pay. It shows as due on the order.");
        expect(
            differenceNote({ ...base, differenceCents: -4000, paid: "online" }),
        ).toBe("₹40 back to them. It goes back to Razorpay when you save.");
    });

    it("paid by hand: the counter takes it or gives it back", () => {
        expect(
            differenceNote({ ...base, differenceCents: 4000, paid: "by-hand" }),
        ).toBe("₹40 more to pay — take it at the counter.");
        expect(
            differenceNote({
                ...base,
                differenceCents: -4000,
                paid: "by-hand",
            }),
        ).toBe("₹40 back to them — give it back from the till.");
    });

    it("not paid yet: the total moves", () => {
        expect(
            differenceNote({ ...base, differenceCents: 4000, paid: "unpaid" }),
        ).toBe("₹40 more to pay. The order's total goes up by it.");
    });

    it("no difference says so", () => {
        expect(
            differenceNote({ ...base, differenceCents: 0, paid: "online" }),
        ).toBe("Same charge — nothing to take or give back.");
    });
});

describe("saveLabel", () => {
    it("names the refund, or the pay link, or just saves", () => {
        expect(
            saveLabel({
                differenceCents: -4000,
                paid: "online",
                linkable: true,
                format,
            }),
        ).toBe("Save and refund ₹40");
        expect(
            saveLabel({
                differenceCents: 4000,
                paid: "online",
                linkable: true,
                format,
            }),
        ).toBe("Save and make pay link");
        expect(
            saveLabel({
                differenceCents: 4000,
                paid: "by-hand",
                linkable: true,
                format,
            }),
        ).toBe("Save");
    });
});

describe("changeAccess — whether B9's buttons open, for this viewer", () => {
    const next = {
        stages: [],
        undo: null,
        editable: true,
        fulfilment: { options: [], refusal: null },
        cancel: { refusal: null, pending: false },
    };
    const owner = { write: true, refund: true };

    it("opens both for someone who may change and refund", () => {
        expect(changeAccess({ next, paymentStatus: "PAID" }, owner)).toEqual({
            fulfilment: null,
            cancel: null,
        });
    });

    it("says the API's reason first", () => {
        expect(
            changeAccess(
                {
                    next: {
                        ...next,
                        fulfilment: {
                            options: [],
                            refusal: "It has already been handed over.",
                        },
                        cancel: {
                            refusal:
                                "It has been handed over, so it can't be cancelled. Refund it instead.",
                            pending: false,
                        },
                    },
                    paymentStatus: "PAID",
                },
                owner,
            ),
        ).toEqual({
            fulfilment: "It has already been handed over.",
            cancel: "It has been handed over, so it can't be cancelled. Refund it instead.",
        });
    });

    it("a cancel waiting on its refund can't be asked again", () => {
        expect(
            changeAccess(
                {
                    next: { ...next, cancel: { refusal: null, pending: true } },
                    paymentStatus: "PAID",
                },
                owner,
            ).cancel,
        ).toBe("Cancelling — waiting for the refund to be confirmed");
    });

    it("a paid order's cancel needs a refund role; an unpaid one doesn't", () => {
        const writer = { write: true, refund: false };
        expect(
            changeAccess({ next, paymentStatus: "PAID" }, writer).cancel,
        ).toBe("Your role can't refund");
        expect(
            changeAccess({ next, paymentStatus: "UNPAID" }, writer).cancel,
        ).toBeNull();
    });

    it("draws nothing for an API from before B9", () => {
        expect(
            changeAccess(
                {
                    next: { stages: [], undo: null, editable: true },
                    paymentStatus: "PAID",
                },
                owner,
            ),
        ).toEqual({});
    });
});

describe("moneyText", () => {
    it("drops empty paise", () => {
        expect(moneyText(4000)).toBe("40");
        expect(moneyText(4005)).toBe("40.05");
    });
});
