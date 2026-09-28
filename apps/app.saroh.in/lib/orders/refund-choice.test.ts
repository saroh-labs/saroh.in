import { describe, expect, it } from "vitest";

import { anotherAmount, reasonText, REFUND_REASONS } from "./refund-choice";

const format = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

describe("reasonText — what the order keeps as why (B8)", () => {
    it("lists the design's reasons, in its order", () => {
        expect(REFUND_REASONS.map((r) => r.label)).toEqual([
            "Wrong item",
            "Quality",
            "Late",
            "Customer changed their mind",
            "Goodwill",
            "Other",
        ]);
    });

    it("is the chosen reason's label, or nothing when none was chosen", () => {
        expect(reasonText("late", "")).toBe("Late");
        expect(reasonText("changed", "ignored")).toBe(
            "Customer changed their mind",
        );
        expect(reasonText("", "typed")).toBeNull();
    });

    it("for Other, is what was typed — or Other when nothing was", () => {
        expect(reasonText("other", "  Box arrived crushed ")).toBe(
            "Box arrived crushed",
        );
        expect(reasonText("other", "   ")).toBe("Other");
        expect(reasonText("other", "x".repeat(600))).toHaveLength(500);
    });
});

describe("anotherAmount — Or another amount (B8)", () => {
    it("empty means the lines decide", () => {
        expect(anotherAmount("", 480, format)).toEqual({ kind: "none" });
        expect(anotherAmount("  ", 480, format)).toEqual({ kind: "none" });
    });

    it("takes whole rupees and paise, as money the API reads", () => {
        expect(anotherAmount("50", 480, format)).toEqual({
            kind: "ok",
            amount: 50,
            money: "50.00",
        });
        expect(anotherAmount("49.5", 480, format)).toEqual({
            kind: "ok",
            amount: 49.5,
            money: "49.50",
        });
        // Exactly what is left is fine.
        expect(anotherAmount("480", 480, format).kind).toBe("ok");
    });

    it("refuses what isn't money, zero, and three decimals", () => {
        for (const raw of ["abc", "-5", "1e3", "5.001", "₹50"]) {
            expect(anotherAmount(raw, 480, format)).toEqual({
                kind: "bad",
                error: "Type an amount like 50 or 49.50.",
            });
        }
        expect(anotherAmount("0", 480, format)).toEqual({
            kind: "bad",
            error: "Type an amount above zero.",
        });
    });

    it("says the most it can be, as the API would", () => {
        expect(anotherAmount("500", 480, format)).toEqual({
            kind: "bad",
            error: "At most ₹480 can be refunded.",
        });
        expect(anotherAmount("1", 0, format)).toEqual({
            kind: "bad",
            error: "Nothing is left to refund on this order.",
        });
    });
});
