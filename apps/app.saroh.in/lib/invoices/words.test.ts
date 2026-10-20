import { describe, expect, it } from "vitest";

import type { InvoicePayment } from "./service";
import {
    CANT_RECORD_PAYMENT,
    NOT_PAID_YET,
    RECORD_PAYMENT,
    chequeLine,
    chequesWaitingLine,
    daysLate,
    lateNudge,
    leftToPayLine,
    overdueFigure,
    partlyPaidLine,
    paymentEvents,
    paymentWay,
    sharedLine,
    toCollect,
    unpaidLine,
} from "./words";

/**
 * The Payments audit's copy rewrites (FINDINGS, 19 Oct) and the round-2
 * boards' words, said one way everywhere (DEC-173, U7 #1119).
 */

function pay(over: Partial<InvoicePayment> = {}): InvoicePayment {
    return {
        id: "p1",
        amount: "4000.00",
        currency: "INR",
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: "2026-10-12T06:00:00Z",
        recordedAt: "2026-10-12T06:00:00Z",
        cheque: null,
        bankStatus: null,
        clearedAt: null,
        bouncedAt: null,
        bounceReason: null,
        removed: null,
        canRemove: true,
        ...over,
    };
}

const CHEQUE = pay({
    amount: "8400.00",
    method: "CHEQUE",
    cheque: { number: "004512", bank: "HDFC Bank" },
    bankStatus: "WAITING",
    receivedAt: "2026-10-19T06:00:00Z",
});
const TOTAL = 840_000;

describe("the copy rewrites", () => {
    it("Record payment is the one name (was Mark paid and Record a payment)", () => {
        expect(RECORD_PAYMENT).toBe("Record payment");
    });

    it("Not paid yet. When the money comes in, record it.", () => {
        expect(NOT_PAID_YET).toBe(
            "Not paid yet. When the money comes in, record it.",
        );
    });

    it("₹2,500 unpaid · 13 days late", () => {
        expect(unpaidLine("₹2,500", 13)).toBe("₹2,500 unpaid · 13 days late");
        expect(unpaidLine("₹2,500", 1)).toBe("₹2,500 unpaid · 1 day late");
        expect(unpaidLine("₹2,500", null)).toBe("₹2,500 unpaid");
        expect(unpaidLine("₹2,500", 0)).toBe("₹2,500 unpaid");
    });

    it("Overdue ₹2,79,268 · 77", () => {
        expect(overdueFigure("₹2,79,268", 77)).toBe("Overdue ₹2,79,268 · 77");
        expect(overdueFigure("₹20,44,971", 1204)).toBe(
            "Overdue ₹20,44,971 · 1,204",
        );
    });

    it("1 day late. Share it on WhatsApp or call Vinay.", () => {
        expect(lateNudge(1, "Vinay")).toBe(
            "1 day late. Share it on WhatsApp or call Vinay.",
        );
        expect(lateNudge(13, "Vivek")).toBe(
            "13 days late. Share it on WhatsApp or call Vivek.",
        );
    });

    it("Partly paid ₹1,000 of ₹2,500", () => {
        expect(partlyPaidLine("₹1,000", "₹2,500")).toBe(
            "Partly paid ₹1,000 of ₹2,500",
        );
    });

    it("the money card's figures", () => {
        expect(toCollect("₹8,400")).toBe("₹8,400 to collect");
        expect(leftToPayLine("₹4,400")).toBe("₹4,400 left to pay");
        expect(daysLate(0)).toBe("1 day late");
        expect(chequesWaitingLine(2, "₹14,000")).toBe(
            "Cheques not in the bank · 2 · ₹14,000",
        );
    });

    it("a role without money is told why, without naming a role", () => {
        expect(CANT_RECORD_PAYMENT).toBe(
            "Recording money isn't part of your role.",
        );
        expect(CANT_RECORD_PAYMENT).not.toMatch(/owner|admin|member/i);
    });
});

describe("paymentWay", () => {
    it("says each way inside a sentence", () => {
        expect(paymentWay("CASH")).toBe("cash");
        expect(paymentWay("UPI")).toBe("UPI");
        expect(paymentWay("BANK_TRANSFER")).toBe("bank transfer");
        expect(paymentWay("CHEQUE")).toBe("cheque");
        expect(paymentWay("ONLINE")).toBe("online");
        expect(paymentWay("OTHER")).toBe("another way");
        expect(paymentWay("WALLET_PAY")).toBe("wallet pay");
    });
});

describe("paymentEvents: what happened to one payment", () => {
    it("a payment of all of it, and a part payment", () => {
        expect(
            paymentEvents(
                pay({ amount: "8400.00", method: "BANK_TRANSFER" }),
                TOTAL,
            ),
        ).toEqual([
            {
                at: "2026-10-12T06:00:00Z",
                text: "Payment recorded · bank transfer",
                struck: false,
            },
        ]);
        expect(paymentEvents(pay(), TOTAL)[0]?.text).toBe(
            "Part payment ₹4,000 · cash",
        );
    });

    it("online", () => {
        expect(
            paymentEvents(
                pay({ amount: "8400.00", method: "ONLINE" }),
                TOTAL,
            )[0]?.text,
        ).toBe("Paid online · ₹8,400");
    });

    it("a cheque waiting, in the bank, and bounced", () => {
        expect(paymentEvents(CHEQUE, TOTAL)).toEqual([
            {
                at: "2026-10-19T06:00:00Z",
                text: "Cheque received · ₹8,400 · not in the bank yet",
                struck: false,
            },
        ]);
        expect(
            paymentEvents(
                {
                    ...CHEQUE,
                    bankStatus: "CLEARED",
                    clearedAt: "2026-10-21T06:00:00Z",
                },
                TOTAL,
            ),
        ).toEqual([
            {
                at: "2026-10-19T06:00:00Z",
                text: "Cheque received · ₹8,400",
                struck: false,
            },
            {
                at: "2026-10-21T06:00:00Z",
                text: "Cheque 004512 is in the bank",
            },
        ]);
        expect(
            paymentEvents(
                {
                    ...CHEQUE,
                    bankStatus: "BOUNCED",
                    bouncedAt: "2026-10-21T06:00:00Z",
                    bounceReason: "insufficient funds",
                },
                TOTAL,
            ),
        ).toEqual([
            {
                at: "2026-10-19T06:00:00Z",
                text: "Cheque received · ₹8,400",
                struck: true,
            },
            {
                at: "2026-10-21T06:00:00Z",
                text: "Cheque 004512 bounced · ₹8,400 owed again · insufficient funds",
            },
        ]);
    });

    it("a payment removed by mistake: struck through, with the reason", () => {
        expect(
            paymentEvents(
                pay({
                    removed: {
                        at: "2026-10-13T06:00:00Z",
                        reason: "Recorded by mistake",
                    },
                }),
                TOTAL,
            ),
        ).toEqual([
            {
                at: "2026-10-12T06:00:00Z",
                text: "Part payment ₹4,000 · cash",
                struck: true,
            },
            {
                at: "2026-10-13T06:00:00Z",
                text: "Payment of ₹4,000 removed · Recorded by mistake",
            },
        ]);
    });

    it("a cheque with no number still reads", () => {
        expect(
            paymentEvents(
                {
                    ...CHEQUE,
                    cheque: { number: null, bank: null },
                    bankStatus: "CLEARED",
                    clearedAt: "2026-10-21T06:00:00Z",
                },
                TOTAL,
            )[1]?.text,
        ).toBe("Cheque is in the bank");
    });
});

describe("chequeLine", () => {
    it("Cheque 004512 · HDFC Bank · received 19 Oct", () => {
        expect(
            chequeLine(
                CHEQUE,
                "Asia/Kolkata",
                new Date("2026-10-20T05:00:00Z"),
            ),
        ).toBe("Cheque 004512 · HDFC Bank · received 19 Oct");
    });

    it("leaves out what wasn't written down", () => {
        expect(
            chequeLine(
                { ...CHEQUE, cheque: { number: null, bank: null } },
                "Asia/Kolkata",
                new Date("2026-10-20T05:00:00Z"),
            ),
        ).toBe("Cheque · received 19 Oct");
    });
});

describe("sharedLine: WhatsApp is shared, never sent", () => {
    it("says each channel and kind", () => {
        expect(sharedLine({ channel: "WHATSAPP", kind: "NEW" })).toBe(
            "Shared on WhatsApp",
        );
        expect(sharedLine({ channel: "WHATSAPP", kind: "REMINDER" })).toBe(
            "Reminder shared on WhatsApp",
        );
        expect(sharedLine({ channel: "WHATSAPP", kind: "RECEIPT" })).toBe(
            "Receipt shared on WhatsApp",
        );
        expect(sharedLine({ channel: "LINK", kind: "NEW" })).toBe(
            "Link copied",
        );
        expect(sharedLine({ channel: "LINK", kind: "REMINDER" })).toBe(
            "Reminder link copied",
        );
        expect(sharedLine({ channel: "PDF", kind: "NEW" })).toBe(
            "PDF downloaded",
        );
        expect(sharedLine({ channel: "PRINT", kind: "RECEIPT" })).toBe(
            "Printed",
        );
    });

    it("never claims a WhatsApp message was sent", () => {
        for (const kind of ["NEW", "REMINDER", "RECEIPT"] as const) {
            expect(sharedLine({ channel: "WHATSAPP", kind })).not.toMatch(
                /sent/i,
            );
        }
    });
});
