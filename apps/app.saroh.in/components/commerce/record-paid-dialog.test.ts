import { describe, expect, it } from "vitest";

import { eventText } from "@/lib/orders/lifecycle";
import type { OrderReadEvent } from "@/lib/orders/read";

import {
    handRefundAmount,
    handRefundDone,
    handRefundVerb,
} from "@/lib/orders/hand-refund";

import { recordWords } from "./record-paid-dialog";

const format = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Record as refunded (UX-061) asks how the money went back, like Record as
 * paid, and the order's timeline then says how much and how. Since #865
 * it asks how much too: the full amount, or another amount up to what is
 * left.
 */
describe("Record as refunded", () => {
    it("asks how it went back", () => {
        expect(recordWords(true)).toMatchObject({
            title: "Record a refund?",
            legend: "How did it go back?",
            verb: "Record as refunded",
        });
        expect(recordWords(false).verb).toBe("Record as paid");
    });

    it("records the full amount unless another is typed (#865)", () => {
        const full = handRefundAmount("full", "50", 298, format);
        expect(full).toEqual({ kind: "full" });
        expect(handRefundVerb(full, format)).toBe("Record as refunded");

        expect(handRefundAmount("another", "", 298, format)).toEqual({
            kind: "none",
        });
        const part = handRefundAmount("another", "120.5", 298, format);
        expect(part).toEqual({ kind: "ok", amount: 120.5, money: "120.50" });
        expect(handRefundVerb(part, format)).toBe("Record ₹120.5 refunded");
    });

    it("refuses nothing, a malformed amount, and more than is left (#865)", () => {
        expect(handRefundAmount("another", "0", 298, format)).toEqual({
            kind: "bad",
            error: "Type an amount above zero.",
        });
        expect(handRefundAmount("another", "12.345", 298, format)).toEqual({
            kind: "bad",
            error: "Type an amount like 50 or 49.50.",
        });
        expect(handRefundAmount("another", "298.01", 298, format)).toEqual({
            kind: "bad",
            error: "At most ₹298 can be refunded.",
        });
    });

    it("says how much went back when it is part (#865)", () => {
        expect(handRefundDone("ORD-012", 100, format)).toBe(
            "₹100 recorded as refunded on ORD-012",
        );
        expect(handRefundDone("ORD-012", null, format)).toBe(
            "ORD-012 marked refunded",
        );
    });

    it("leaves a step on the timeline with the amount and the way", () => {
        const e = {
            id: "e1",
            kind: "REFUND",
            note: "Handed back in cash",
            amountCents: 129_900,
        } as OrderReadEvent;
        expect(
            eventText(e, (c) => `₹${(c / 100).toLocaleString("en-IN")}`),
        ).toBe("Refunded ₹1,299 · Handed back in cash");
        // Without the money read, the way and no figure.
        expect(eventText({ ...e, amountCents: undefined }, () => null)).toBe(
            "Refunded · Handed back in cash",
        );
    });
});
