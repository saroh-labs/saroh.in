import { BadRequestException } from "@nestjs/common";

import type { RefundableLine } from "./order-refunds";
import {
    allocateAcrossPayments,
    linePaidCents,
    planLineRefund,
    planRemainingLines,
    refundStanding,
} from "./order-refunds";

const line = (
    id: string,
    quantity: number,
    unitCents: number,
    refunded: { q: number; c: number } = { q: 0, c: 0 },
): RefundableLine => ({
    id,
    quantity,
    unitCents,
    refundedQuantity: refunded.q,
    refundedCents: refunded.c,
});

describe("linePaidCents — the discount spread across lines", () => {
    it("with no discount, a line paid its price × quantity", () => {
        const paid = linePaidCents([line("a", 2, 1000), line("b", 1, 500)], 0);
        expect(paid.get("a")).toBe(2000);
        expect(paid.get("b")).toBe(500);
    });

    it("spreads a discount in proportion and to the paisa", () => {
        // 100.00 off 300.00: a third off each.
        const paid = linePaidCents(
            [line("a", 1, 10000), line("b", 1, 10000), line("c", 1, 10000)],
            10000,
        );
        const shares = ["a", "b", "c"].map((id) => paid.get(id) ?? 0);
        expect(shares.reduce((s, x) => s + x, 0)).toBe(20000);
        // 3333 or 3334 off each; never a paisa lost or made up.
        for (const s of shares) expect([6666, 6667]).toContain(s);
    });
});

describe("planLineRefund", () => {
    const LINES = [line("a", 2, 1000), line("b", 1, 1500), line("c", 1, 750)];

    it("prices the chosen lines on the server", () => {
        expect(
            planLineRefund(LINES, 0, [
                { itemId: "a", quantity: 1 },
                { itemId: "c", quantity: 1 },
            ]),
        ).toEqual([
            { itemId: "a", quantity: 1, amountCents: 1000 },
            { itemId: "c", quantity: 1, amountCents: 750 },
        ]);
    });

    it("refunding one unit at a time returns exactly what refunding at once would", () => {
        // 3 × 3.33 with 1.00 off: odd paise.
        const lines = [line("a", 3, 333)];
        const all = planLineRefund(lines, 100, [{ itemId: "a", quantity: 3 }]);
        let refunded = { q: 0, c: 0 };
        let sum = 0;
        for (let i = 0; i < 3; i++) {
            const [step] = planLineRefund([line("a", 3, 333, refunded)], 100, [
                { itemId: "a", quantity: 1 },
            ]);
            sum += step.amountCents;
            refunded = { q: refunded.q + 1, c: refunded.c + step.amountCents };
        }
        expect(sum).toBe(all[0].amountCents);
        expect(sum).toBe(899);
    });

    it("refuses more of a line than is left of it (the cap)", () => {
        const lines = [line("a", 2, 1000, { q: 1, c: 1000 })];
        expect(() =>
            planLineRefund(lines, 0, [{ itemId: "a", quantity: 2 }]),
        ).toThrow(/Only 1 of that line is left/);
    });

    it("refuses a line already refunded in full", () => {
        const lines = [line("a", 1, 1000, { q: 1, c: 1000 })];
        expect(() =>
            planLineRefund(lines, 0, [{ itemId: "a", quantity: 1 }]),
        ).toThrow(/already been refunded/);
    });

    it("refuses a line that is not on the order, a line named twice, and nothing at all", () => {
        expect(() =>
            planLineRefund(LINES, 0, [{ itemId: "zz", quantity: 1 }]),
        ).toThrow(BadRequestException);
        expect(() =>
            planLineRefund(LINES, 0, [
                { itemId: "a", quantity: 1 },
                { itemId: "a", quantity: 1 },
            ]),
        ).toThrow(/once/);
        expect(() => planLineRefund(LINES, 0, [])).toThrow(BadRequestException);
    });
});

describe("planRemainingLines", () => {
    it("records what is left of every line, and nothing for a line already gone", () => {
        expect(
            planRemainingLines(
                [
                    line("a", 2, 1000, { q: 1, c: 1000 }),
                    line("b", 1, 500, { q: 1, c: 500 }),
                ],
                0,
            ),
        ).toEqual([{ itemId: "a", quantity: 1, amountCents: 1000 }]);
    });
});

describe("allocateAcrossPayments", () => {
    const P = [
        { id: "first", leftCents: 4000 },
        { id: "difference", leftCents: 500 },
    ];

    it("takes from the newest payment first", () => {
        expect(
            allocateAcrossPayments(P, 1200).map((x) => [
                x.payment.id,
                x.amountCents,
            ]),
        ).toEqual([
            ["difference", 500],
            ["first", 700],
        ]);
    });

    it("refuses more than all the payments have left (the order cap)", () => {
        expect(() => allocateAcrossPayments(P, 4501)).toThrow(
            /more than is left/,
        );
    });
});

describe("refundStanding — derived, never stored", () => {
    it("reads partly refunded while money remains, refunded once it has all gone back", () => {
        expect(refundStanding("PAID", 4250, 0)).toBe("NONE");
        expect(refundStanding("PAID", 4250, 1000)).toBe("PARTLY_REFUNDED");
        expect(refundStanding("PAID", 4250, 4250)).toBe("REFUNDED");
        expect(refundStanding("REFUNDED", 4250, 4250)).toBe("REFUNDED");
    });
});
