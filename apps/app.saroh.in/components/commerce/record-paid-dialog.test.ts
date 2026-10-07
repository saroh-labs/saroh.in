import { describe, expect, it } from "vitest";

import { eventText } from "@/lib/orders/lifecycle";
import type { OrderReadEvent } from "@/lib/orders/read";

import { recordWords } from "./record-paid-dialog";

/**
 * Record as refunded (UX-061) asks how the money went back, like Record as
 * paid, and the order's timeline then says how much and how.
 */
describe("Record as refunded", () => {
    it("asks how it went back", () => {
        expect(recordWords(true)).toMatchObject({
            title: "Record this order as refunded?",
            legend: "How did it go back?",
            verb: "Record as refunded",
        });
        expect(recordWords(false).verb).toBe("Record as paid");
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
