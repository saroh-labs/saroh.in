import { describe, expect, it } from "vitest";

import {
    checkedLine,
    explainStart,
    intervalWords,
    latestInvoiceNote,
    nextLine,
    owedLine,
    standing,
} from "./renewal";

const NOW = new Date("2026-09-24T10:00:00Z");
const base = {
    status: "ACTIVE" as const,
    timezone: "UTC",
    nextRenewalAt: "2026-10-01T00:00:00.000Z",
    endsAt: null,
    pausedAt: null,
    cancelledAt: null,
    overdue: false,
    overdueCount: 0,
    unpaidCount: 0,
    unpaidTotal: "0.00",
    currency: "INR",
    latestInvoice: null,
};

describe("nextLine", () => {
    it("says when it renews, when it ends, or that it is paused", () => {
        expect(nextLine(base)).toBe("Renews 1 Oct");
        expect(
            nextLine({
                ...base,
                nextRenewalAt: null,
                endsAt: "2026-10-01T00:00:00.000Z",
            }),
        ).toBe("Ends 1 Oct");
        expect(
            nextLine({
                ...base,
                status: "PAUSED",
                nextRenewalAt: null,
                pausedAt: "2026-09-05T08:00:00.000Z",
            }),
        ).toBe("Paused since 5 Sept");
        expect(
            nextLine({
                ...base,
                status: "CANCELLED",
                nextRenewalAt: null,
                cancelledAt: "2026-09-10T08:00:00.000Z",
            }),
        ).toBe("Ended 10 Sept");
    });

    it("reads the date in the subscription's own timezone", () => {
        // 1 Oct 00:00 in Kolkata is 30 Sep 18:30 UTC.
        expect(
            nextLine({
                ...base,
                timezone: "Asia/Kolkata",
                nextRenewalAt: "2026-09-30T18:30:00.000Z",
            }),
        ).toBe("Renews 1 Oct");
    });
});

describe("standing", () => {
    it("puts an overdue subscription on Overdue alone, whatever else it is", () => {
        expect(standing({ ...base, overdue: true })).toBe("OVERDUE");
        expect(standing({ ...base, status: "PAUSED", overdue: true })).toBe(
            "OVERDUE",
        );
        expect(standing(base)).toBe("ACTIVE");
        expect(standing({ ...base, status: "PAUSED" })).toBe("PAUSED");
        expect(standing({ ...base, status: "CANCELLED", overdue: true })).toBe(
            "CANCELLED",
        );
    });
});

describe("owedLine", () => {
    it("says how many are overdue and what is owed", () => {
        expect(
            owedLine({
                ...base,
                overdue: true,
                overdueCount: 2,
                unpaidCount: 2,
                unpaidTotal: "3000.00",
            }),
        ).toBe("2 invoices overdue · ₹3,000.00");
        expect(
            owedLine({
                ...base,
                overdue: true,
                overdueCount: 1,
                unpaidCount: 1,
                unpaidTotal: "1200.00",
            }),
        ).toBe("1 invoice overdue · ₹1,200.00");
        expect(owedLine(base)).toBeNull();
    });
});

describe("latestInvoiceNote", () => {
    it("says how late, when paid, or when due", () => {
        expect(
            latestInvoiceNote(
                {
                    ...base,
                    latestInvoice: {
                        id: "i",
                        number: "INV-0042",
                        status: "ISSUED",
                        dueAt: "2026-09-08T00:00:00.000Z",
                        paidAt: null,
                    },
                },
                NOW,
            ),
        ).toBe("16 days past due");
        expect(
            latestInvoiceNote(
                {
                    ...base,
                    latestInvoice: {
                        id: "i",
                        number: "INV-0041",
                        status: "PAID",
                        dueAt: "2026-09-08T00:00:00.000Z",
                        paidAt: "2026-09-02T00:00:00.000Z",
                    },
                },
                NOW,
            ),
        ).toBe("Paid 2 Sept");
        expect(
            latestInvoiceNote(
                {
                    ...base,
                    latestInvoice: {
                        id: "i",
                        number: "INV-0050",
                        status: "ISSUED",
                        dueAt: "2026-09-30T00:00:00.000Z",
                        paidAt: null,
                    },
                },
                NOW,
            ),
        ).toBe("Due 30 Sept");
    });
});

describe("explainStart", () => {
    it("explains a start from today", () => {
        expect(explainStart("2026-09-24", "MONTH", "2026-09-24")).toBe(
            "The first invoice is issued now, for 24 Sept to 23 Oct. It renews on the 24th after that.",
        );
    });

    it("explains a backdated start: only the period holding today is billed", () => {
        expect(explainStart("2026-03-15", "MONTH", "2026-09-24")).toBe(
            "It keeps the 15th as its renewal day. Only the period holding today, 15 Sept to 14 Oct, is invoiced now — the months before are not billed.",
        );
    });

    it("clamps a month-end start to a shorter month", () => {
        // 31 Jan → 28 Feb → 31 Mar: on 10 March the period is 28 Feb to 30 Mar.
        expect(explainStart("2026-01-31", "MONTH", "2026-03-10")).toBe(
            "It keeps the 31st as its renewal day. Only the period holding today, 28 Feb to 30 Mar, is invoiced now — the months before are not billed.",
        );
    });

    it("explains weekly plans by weekday", () => {
        expect(explainStart("2026-09-24", "WEEK", "2026-09-24")).toBe(
            "The first invoice is issued now, for 24 Sept to 30 Sept. It renews every Thursday after that.",
        );
    });

    it("explains a start still ahead", () => {
        expect(explainStart("2026-10-01", "MONTH", "2026-09-24")).toBe(
            "The first invoice is issued now, for 1 Oct to 31 Oct. It renews on the 1st after that.",
        );
    });
});

describe("checkedLine", () => {
    it("says when renewals were last checked and what went out", () => {
        expect(
            checkedLine(
                {
                    lastCheckedAt: "2026-09-24T09:46:00.000Z",
                    nextCheckAt: "2026-09-24T10:46:00.000Z",
                    issuedToday: 3,
                },
                NOW,
            ),
        ).toBe(
            "Renewals last checked 14 minutes ago. 3 invoices went out today; the next check is within the hour.",
        );
    });

    it("says so when the job has never run, rather than going quiet", () => {
        expect(
            checkedLine(
                { lastCheckedAt: null, nextCheckAt: null, issuedToday: 0 },
                NOW,
            ),
        ).toBe(
            "Renewals have not been checked yet. Invoices go out when they are.",
        );
    });

    it("warns when the next check is overdue", () => {
        expect(
            checkedLine(
                {
                    lastCheckedAt: "2026-09-24T05:00:00.000Z",
                    nextCheckAt: "2026-09-24T06:00:00.000Z",
                    issuedToday: 0,
                },
                NOW,
            ),
        ).toBe(
            "Renewals last checked 5 hours ago. None went out today; the next check is late.",
        );
    });
});

describe("intervalWords", () => {
    it("names each interval", () => {
        expect(intervalWords("MONTH")).toEqual({
            adj: "Monthly",
            per: "a month",
        });
        expect(intervalWords("QUARTER")).toEqual({
            adj: "Quarterly",
            per: "a quarter",
        });
    });
});
