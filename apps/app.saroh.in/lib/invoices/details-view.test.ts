import { describe, expect, it } from "vitest";

import { historyLines, neighbours, nextLabel, nextStep } from "./details-view";
import type { Invoice, InvoicePayment } from "./service";

/**
 * What an invoice's details draw that isn't a rule of its state (DEC-173,
 * U9 #1121): "What happened" with the ledger in it, the line on top while
 * money is owed, and where Previous and Next go.
 */

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-20T06:00:00Z");
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

function invoice(over: Partial<Invoice> = {}): Invoice {
    return {
        id: "inv_1",
        number: "RC/26-27/0106",
        status: "ISSUED",
        standing: "ISSUED",
        kind: "INVOICE",
        contact: { id: "c_1", name: "Vivek Nair", email: "vivek@example.com" },
        billTo: { name: "Vivek Nair", email: "vivek@example.com" },
        currency: "INR",
        subtotal: "8400.00",
        tax: "0.00",
        total: "8400.00",
        issuedAt: at(-28),
        dueAt: at(-13),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        payment: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissuedAsId: null,
        issuedAutomatically: false,
        createdAt: at(-29),
        updatedAt: at(-1),
        summary: null,
        ...over,
    };
}

function payment(over: Partial<InvoicePayment> = {}): InvoicePayment {
    return {
        id: "pay_1",
        amount: "4000.00",
        currency: "INR",
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: at(-8),
        recordedAt: at(-8),
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

describe("historyLines", () => {
    it("is newest first: a part payment, the due date passing, issued, drafted", () => {
        const lines = historyLines(
            invoice({ standing: "OVERDUE", payments: [payment()] }),
            new Date(NOW),
        );
        expect(lines.map((l) => l.what)).toEqual([
            "Part payment ₹4,000 · cash",
            "Due date passed",
            "RC/26-27/0106 issued",
            "Drafted",
        ]);
        expect(lines[0]?.tone).toBe("ok");
        expect(lines[1]?.tone).toBe("bad");
    });

    it("offers Remove only on a live payment's own line", () => {
        const live = payment();
        const lines = historyLines(invoice({ payments: [live] }));
        expect(lines.find((l) => l.removable)?.removable).toBe(live);
        // The API says an online payment can't be removed: refunded instead.
        const online = historyLines(
            invoice({
                payments: [payment({ method: "ONLINE", canRemove: false })],
            }),
        );
        expect(online.some((l) => l.removable)).toBe(false);
        expect(online[0]?.what).toBe("Paid online · ₹4,000");
    });

    it("keeps a removed payment, struck through, with why", () => {
        const lines = historyLines(
            invoice({
                payments: [
                    payment({
                        canRemove: false,
                        removed: { at: at(-2), reason: "Recorded by mistake" },
                    }),
                ],
            }),
        );
        const removed = lines.find((l) => l.what.startsWith("Payment of"));
        expect(removed?.what).toBe(
            "Payment of ₹4,000 removed · Recorded by mistake",
        );
        expect(removed?.tone).toBe("bad");
        const struck = lines.find((l) => l.struck);
        expect(struck?.what).toBe("Part payment ₹4,000 · cash");
        expect(struck?.removable).toBeUndefined();
    });

    it("says a cheque waits, then that it bounced and is owed again", () => {
        const waiting = historyLines(
            invoice({
                standing: "PAID",
                payments: [
                    payment({
                        amount: "8400.00",
                        method: "CHEQUE",
                        cheque: { number: "004512", bank: "HDFC Bank" },
                        bankStatus: "WAITING",
                    }),
                ],
            }),
        );
        expect(waiting[0]).toMatchObject({
            what: "Cheque received · ₹8,400 · not in the bank yet",
            tone: "waiting",
        });

        const bounced = historyLines(
            invoice({
                payments: [
                    payment({
                        amount: "8400.00",
                        method: "CHEQUE",
                        cheque: { number: "004512", bank: "HDFC Bank" },
                        bankStatus: "BOUNCED",
                        bouncedAt: at(-1),
                        canRemove: false,
                    }),
                ],
            }),
        );
        expect(bounced[0]?.what).toBe(
            "Cheque 004512 bounced · ₹8,400 owed again",
        );
        expect(bounced.find((l) => l.struck)?.what).toBe(
            "Cheque received · ₹8,400",
        );
    });

    it("lists shares by hand, never as sent on WhatsApp", () => {
        const lines = historyLines(
            invoice({
                shared: [
                    {
                        id: "s1",
                        channel: "WHATSAPP",
                        kind: "REMINDER",
                        byUserId: null,
                        at: at(-1),
                    },
                ],
            }),
        );
        expect(lines[0]?.what).toBe("Reminder shared on WhatsApp");
    });

    it("from an API before the ledger, the invoice's own paid line", () => {
        const lines = historyLines(
            invoice({
                standing: "PAID",
                paidAt: at(-3),
                payment: { method: "UPI", reference: "4581", note: null },
            }),
        );
        expect(lines[0]?.what).toBe("Paid by UPI · 4581");
    });
});

describe("nextStep", () => {
    it("is said while money is owed here and this person can act", () => {
        expect(nextStep(invoice(), "Vivek Nair", true)).toEqual({
            what: "Next step is yours",
            sub: "Share it, call Vivek, or record the payment",
        });
        expect(
            nextStep(invoice({ partlyPaid: true }), "Vivek Nair", true)?.sub,
        ).toBe("Share it, call Vivek, or record the rest");
    });

    it("isn't, for a reader, an order's paper, a credit note, or nothing owed", () => {
        expect(nextStep(invoice(), "Vivek Nair", false)).toBeNull();
        expect(
            nextStep(
                invoice({ order: { id: "o", number: "12" } }),
                "Vivek",
                true,
            ),
        ).toBeNull();
        expect(
            nextStep(invoice({ kind: "CREDIT_NOTE" }), "Vivek", true),
        ).toBeNull();
        expect(
            nextStep(invoice({ standing: "PAID" }), "Vivek", true),
        ).toBeNull();
    });
});

describe("Previous and Next", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

    it("walk the rows either side, inside the list as filtered", () => {
        expect(neighbours(rows, "b")).toEqual({
            previous: { id: "a" },
            next: { id: "c" },
        });
        expect(neighbours(rows, "a").previous).toBeNull();
        expect(neighbours(rows, "c").next).toBeNull();
    });

    it("go nowhere for an invoice not on the list (a link to it)", () => {
        expect(neighbours(rows, "z")).toEqual({ previous: null, next: null });
        expect(neighbours(rows, null)).toEqual({ previous: null, next: null });
    });

    it("say what comes next on each filter", () => {
        expect(nextLabel("overdue")).toBe("Next overdue");
        expect(nextLabel("draft")).toBe("Next draft");
        expect(nextLabel("all")).toBe("Next");
    });
});
