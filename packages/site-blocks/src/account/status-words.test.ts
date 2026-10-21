import { describe, expect, it } from "vitest";

import { orderStatusWords, orderWay } from "./status-words";

/**
 * One set of words for an order's stage (DEC-172, plan U12): the API's
 * step label and fulfilment label, in the customer's words, the same in
 * every look. A pick-up is never "on its way".
 */

const order = (status: string, fulfilment: string) => ({
    status,
    fulfilment,
});

describe("an order's stage in the customer's words", () => {
    it("reads a pick-up being made as for pick-up, never on its way", () => {
        const words = orderStatusWords(order("Preparing", "Pick-up"));
        expect(words).toBe("Being made · for pick-up");
        expect(words).toMatch(/pick up|pick-up/i);
        expect(words).not.toMatch(/on its way/i);
    });

    it("walks a pick-up from placed to picked up", () => {
        expect(
            ["New", "Preparing", "Ready", "Collected"].map((s) =>
                orderStatusWords(order(s, "Pick-up")),
            ),
        ).toEqual([
            "Order placed",
            "Being made · for pick-up",
            "Ready for pick-up",
            "Picked up",
        ]);
    });

    it("says on its way only of a delivery", () => {
        expect(
            orderStatusWords(order("Out for delivery", "Local delivery")),
        ).toBe("On its way");
        expect(orderStatusWords(order("Delivered", "Local delivery"))).toBe(
            "Delivered",
        );
        expect(orderStatusWords(order("Ready", "Local delivery"))).not.toMatch(
            /pick/i,
        );
    });

    it("never lets a delivery word reach a pick-up", () => {
        for (const status of [
            "Out for delivery",
            "Handed to courier",
            "On its way to you",
            "Shipped",
        ]) {
            expect(orderStatusWords(order(status, "Pick-up"))).not.toMatch(
                /on its way|courier|deliver|shipped/i,
            );
        }
    });

    it("words a shipped order and a digital one", () => {
        expect(orderStatusWords(order("Handed to courier", "Shipping"))).toBe(
            "With the courier",
        );
        expect(orderStatusWords(order("Paid", "Digital"))).toBe("Paid");
        expect(orderStatusWords(order("Sent", "Digital"))).toBe(
            "Sent to your email",
        );
    });

    it("says how an order ended, whatever its type", () => {
        expect(orderStatusWords(order("Refunded", "Pick-up"))).toBe("Refunded");
        expect(orderStatusWords(order("Cancelled", "Shipping"))).toBe(
            "Cancelled",
        );
    });

    it("keeps a word it doesn't know as the API sent it", () => {
        expect(orderStatusWords(order("Waiting on the kiln", "Shipping"))).toBe(
            "Waiting on the kiln",
        );
    });

    it("reads an unknown type as collected in person", () => {
        expect(orderWay("")).toBe("pick-up");
        expect(orderWay("Booking, in person")).toBe("visit");
        expect(orderWay("Local delivery")).toBe("delivery");
    });
});
