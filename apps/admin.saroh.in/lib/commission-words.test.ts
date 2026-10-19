import { describe, expect, it } from "vitest";

import {
    evidenceFacts,
    markPaidProblem,
    monthLabel,
    percentToBasisPoints,
    rateLabel,
    readMonth,
    stepMonth,
    waitingWords,
} from "./commission-words";

describe("commission words", () => {
    it("reads a typed percentage into basis points and says it back", () => {
        // Drawn per run: no rate is ever written in the repository.
        const bps = Math.floor(Math.random() * 10_001);
        const typed = `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0")}`;
        expect(percentToBasisPoints(typed)).toBe(bps);
        expect(percentToBasisPoints(rateLabel(bps).replace("%", ""))).toBe(bps);
        expect(percentToBasisPoints("100.5")).toBeNull();
        expect(percentToBasisPoints("1.234")).toBeNull();
        expect(percentToBasisPoints("")).toBeNull();
        expect(rateLabel(null)).toBe("No rate");
    });

    it("steps months over the year and names them", () => {
        expect(stepMonth("2026-12", 1)).toBe("2027-01");
        expect(stepMonth("2027-01", -1)).toBe("2026-12");
        expect(monthLabel("2026-12")).toBe("December 2026");
        expect(readMonth("2026-13")).toBeNull();
        expect(readMonth(" 2026-01 ")).toBe("2026-01");
    });

    it("never lets someone mark their own commission paid", () => {
        const row = { platformAdminId: "pa_1", status: "DUE" as const };
        expect(
            markPaidProblem(row, { platformAdminId: "pa_2", canPay: true }),
        ).toBeNull();
        expect(
            markPaidProblem(row, { platformAdminId: "pa_1", canPay: true }),
        ).toMatch(/Someone else/);
        expect(
            markPaidProblem(row, { platformAdminId: null, canPay: false }),
        ).toMatch(/Platform owner or Billing/);
    });

    it("says the proof without an email, and what is waiting", () => {
        expect(
            evidenceFacts({
                source: "LEAD_EMAIL",
                leadId: "lead_1",
                emailRecordedAt: "2026-12-01T00:00:00Z",
                email: "x@example.com",
            }),
        ).toEqual([
            { label: "Lead", value: "lead_1" },
            { label: "Email recorded", value: "2026-12-01T00:00:00Z" },
        ]);
        expect(
            waitingWords({ amountPaise: 0, lines: 0, held: 0, noRate: 0 }),
        ).toBeNull();
        expect(
            waitingWords({ amountPaise: 9, lines: 3, held: 1, noRate: 2 }),
        ).toBe("3 payments (1 held, 2 without a rate)");
    });
});
