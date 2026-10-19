/**
 * Commission's pure rules (DEC-169, admin console U21). Every rate here is
 * drawn at random per run and every amount checked against it: no rate is
 * ever written in this repository.
 */
import type { LineFacts } from "./commission-rules";
import {
    addMonths,
    basisPointsOfPercent,
    commissionPaise,
    installmentEnds,
    installmentsOf,
    isLegalLineMove,
    LINE_STATUSES,
    monthBounds,
    monthOf,
    nextMonth,
    nextStatus,
    refundAfterPayout,
    refundSignal,
    splitEvenly,
    statementMonthFor,
} from "./commission-rules";

const randomInt = (lo: number, hi: number) =>
    lo + Math.floor(Math.random() * (hi - lo + 1));

describe("commissionPaise", () => {
    it("is the base times the rate, rounded half up once, for any rate", () => {
        for (let i = 0; i < 200; i++) {
            const bps = randomInt(0, 10_000);
            const base = randomInt(0, 50_000_000);
            const got = commissionPaise(base, bps);
            const exact = (base * bps) / 10_000;
            expect(Number.isInteger(got)).toBe(true);
            expect(Math.abs(got - exact)).toBeLessThanOrEqual(0.5);
            expect(got).toBe(Math.floor(exact + 0.5));
        }
    });

    it("all of it at the top and nothing at zero", () => {
        const base = randomInt(1, 9_999_999);
        expect(commissionPaise(base, 10_000)).toBe(base);
        expect(commissionPaise(base, 0)).toBe(0);
    });

    it("refuses what isn't a rate or whole paise", () => {
        expect(() => commissionPaise(100, -1)).toThrow(RangeError);
        expect(() => commissionPaise(100, 10_001)).toThrow(RangeError);
        expect(() => commissionPaise(100, 1.5)).toThrow(RangeError);
        expect(() => commissionPaise(-1, 1)).toThrow(RangeError);
        expect(() => commissionPaise(1.2, 1)).toThrow(RangeError);
    });
});

describe("one twelfth a month for a year paid at once", () => {
    it("a year is twelve lines; anything else one", () => {
        expect(installmentsOf("year")).toBe(12);
        expect(installmentsOf("month")).toBe(1);
        expect(installmentsOf("anything")).toBe(1);
    });

    it("the twelfths add up to the year exactly, each within a paisa", () => {
        for (let i = 0; i < 100; i++) {
            const total = randomInt(0, 10_000_000);
            const parts = splitEvenly(total, 12);
            expect(parts).toHaveLength(12);
            expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
            expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(
                1,
            );
        }
    });

    it("each month of the year becomes payable at its own end, the last at the period's", () => {
        const start = new Date("2026-11-21T06:30:00.000Z");
        const end = new Date("2027-11-21T06:30:00.000Z");
        const ends = installmentEnds({
            periodStart: start,
            periodEnd: end,
            installments: 12,
        });
        expect(ends).toHaveLength(12);
        expect(ends[0]!.toISOString()).toBe("2026-12-21T06:30:00.000Z");
        expect(ends[1]!.toISOString()).toBe("2027-01-21T06:30:00.000Z");
        expect(ends[11]).toEqual(end);
        expect(
            installmentEnds({
                periodStart: start,
                periodEnd: end,
                installments: 1,
            }),
        ).toEqual([end]);
    });

    it("a month on from the 31st is the next month's last day", () => {
        expect(
            addMonths(new Date("2027-01-31T00:00:00Z"), 1).toISOString(),
        ).toBe("2027-02-28T00:00:00.000Z");
    });
});

describe("statement months, in India", () => {
    it("a period of 21 Nov to 20 Dec is paid with December's", () => {
        // 20 Dec, late evening in India, still December.
        expect(
            statementMonthFor(new Date("2026-12-20T17:00:00.000Z"), new Set()),
        ).toBe("2026-12");
    });

    it("an end just after midnight in India is that day's month", () => {
        expect(monthOf(new Date("2026-11-30T18:45:00.000Z"))).toBe("2026-12");
        expect(monthOf(new Date("2026-11-30T18:15:00.000Z"))).toBe("2026-11");
    });

    it("a month already paid sends it to the next one not yet paid", () => {
        const end = new Date("2026-12-20T00:00:00.000Z");
        expect(statementMonthFor(end, new Set(["2026-12"]))).toBe("2027-01");
        expect(statementMonthFor(end, new Set(["2026-12", "2027-01"]))).toBe(
            "2027-02",
        );
    });

    it("steps over the year and bounds a month in India", () => {
        expect(nextMonth("2026-12")).toBe("2027-01");
        expect(nextMonth("2026-01")).toBe("2026-02");
        const { from, to } = monthBounds("2026-12");
        expect(from.toISOString()).toBe("2026-11-30T18:30:00.000Z");
        expect(to.toISOString()).toBe("2026-12-31T18:30:00.000Z");
        expect(() => nextMonth("2026-13")).toThrow(RangeError);
    });
});

describe("refunds and disputes", () => {
    it("money gone back cancels; one that may yet go back waits; the rest say nothing", () => {
        expect(refundSignal([])).toBe("none");
        expect(refundSignal([{ kind: "REFUND", status: "FAILED" }])).toBe(
            "none",
        );
        expect(refundSignal([{ kind: "REFUND", status: "PENDING" }])).toBe(
            "wait",
        );
        expect(refundSignal([{ kind: "REFUND", status: "PROCESSED" }])).toBe(
            "cancel",
        );
        expect(refundSignal([{ kind: "DISPUTE", status: "OPEN" }])).toBe(
            "wait",
        );
        expect(
            refundSignal([{ kind: "DISPUTE", status: "UNDER_REVIEW" }]),
        ).toBe("wait");
        expect(refundSignal([{ kind: "DISPUTE", status: "WON" }])).toBe("none");
        expect(refundSignal([{ kind: "DISPUTE", status: "CLOSED" }])).toBe(
            "none",
        );
        expect(refundSignal([{ kind: "DISPUTE", status: "LOST" }])).toBe(
            "cancel",
        );
        expect(
            refundSignal([
                { kind: "REFUND", status: "PENDING" },
                { kind: "REFUND", status: "PROCESSED" },
            ]),
        ).toBe("cancel");
    });
});

describe("where a line goes next", () => {
    const facts = (over: Partial<LineFacts> = {}): LineFacts => ({
        status: "PENDING",
        refund: "none",
        rated: true,
        held: false,
        periodEnded: false,
        ...over,
    });

    it("pending until its period ends clean, then payable", () => {
        expect(nextStatus(facts())).toBe("PENDING");
        expect(nextStatus(facts({ periodEnded: true }))).toBe("PAYABLE");
        expect(
            nextStatus(facts({ status: "PAYABLE", periodEnded: true })),
        ).toBe("PAYABLE");
    });

    it("money back cancels before anything else, unless it is paid", () => {
        expect(
            nextStatus(
                facts({
                    refund: "cancel",
                    rated: false,
                    held: true,
                    periodEnded: true,
                }),
            ),
        ).toBe("CANCELLED");
        expect(nextStatus(facts({ status: "PAYABLE", refund: "cancel" }))).toBe(
            "CANCELLED",
        );
        const paid = facts({ status: "PAID", refund: "cancel" });
        expect(nextStatus(paid)).toBe("PAID");
        expect(refundAfterPayout(paid)).toBe(true);
        expect(refundAfterPayout(facts({ refund: "cancel" }))).toBe(false);
    });

    it("no rate, then a mismatch, then an open refund each keep it from paying", () => {
        expect(nextStatus(facts({ rated: false, periodEnded: true }))).toBe(
            "NO_RATE",
        );
        expect(nextStatus(facts({ held: true, periodEnded: true }))).toBe(
            "HELD",
        );
        expect(nextStatus(facts({ refund: "wait", periodEnded: true }))).toBe(
            "PENDING",
        );
        expect(nextStatus(facts({ status: "HELD", periodEnded: true }))).toBe(
            "PAYABLE",
        );
        expect(nextStatus(facts({ status: "NO_RATE" }))).toBe("PENDING");
    });

    it("nothing leaves CANCELLED or PAID, and only PAYABLE becomes PAID", () => {
        for (const to of LINE_STATUSES) {
            expect(isLegalLineMove("CANCELLED", to)).toBe(to === "CANCELLED");
            expect(isLegalLineMove("PAID", to)).toBe(to === "PAID");
        }
        expect(isLegalLineMove("PAYABLE", "PAID")).toBe(true);
        expect(isLegalLineMove("PENDING", "PAID")).toBe(false);
        expect(isLegalLineMove("HELD", "PAID")).toBe(false);
        expect(isLegalLineMove("PAYABLE", "PENDING")).toBe(true);
        expect(
            nextStatus(facts({ status: "CANCELLED", periodEnded: true })),
        ).toBe("CANCELLED");
    });
});

describe("a rate typed as a percentage", () => {
    it("reads up to two decimals into basis points, and nothing over all of it", () => {
        const bps = randomInt(0, 10_000);
        const typed = `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0")}`;
        expect(basisPointsOfPercent(typed)).toBe(bps);
        expect(basisPointsOfPercent("100")).toBe(10_000);
        expect(basisPointsOfPercent("100.01")).toBeNull();
        expect(basisPointsOfPercent("1.234")).toBeNull();
        expect(basisPointsOfPercent("-1")).toBeNull();
        expect(basisPointsOfPercent("abc")).toBeNull();
    });
});
