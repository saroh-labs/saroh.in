import { describe, expect, it } from "vitest";

import { historyLines, neighbours, nextLabel, nextStep } from "./details-view";
import type { Invoice, InvoiceEvent, InvoicePayment } from "./service";

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

const RAVI = { kind: "USER" as const, userId: "u_ravi", name: "Ravi Kumar" };
const SAROH = { kind: "JOB" as const, userId: null, name: null };

function event(over: Partial<InvoiceEvent>): InvoiceEvent {
    return {
        id: `e_${over.kind ?? "ISSUED"}`,
        kind: "ISSUED",
        at: at(-1),
        actor: RAVI,
        channel: null,
        messageId: null,
        to: null,
        status: null,
        thread: false,
        reason: null,
        creditNoteId: null,
        creditNoteNumber: null,
        draftId: null,
        template: null,
        autopay: false,
        view: false,
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

    it("offers Bounced on a cheque in the bank, and says when one came back after it was banked (#7)", () => {
        const banked = payment({
            amount: "8400.00",
            method: "CHEQUE",
            cheque: { number: "004512", bank: "HDFC Bank" },
            bankStatus: "CLEARED",
            clearedAt: at(-3),
        });
        const inBank = historyLines(
            invoice({ standing: "PAID", payments: [banked] }),
        );
        expect(inBank.find((l) => l.bounceable)?.bounceable).toBe(banked);
        expect(inBank.map((l) => l.what)).toContain(
            "Cheque 004512 is in the bank",
        );

        const returned = historyLines(
            invoice({
                payments: [
                    {
                        ...banked,
                        bankStatus: "BOUNCED",
                        bouncedAt: at(-1),
                        canRemove: false,
                    },
                ],
            }),
        );
        expect(returned[0]).toMatchObject({
            what: "Cheque 004512 bounced after it was banked · ₹8,400 owed again",
            tone: "bad",
        });
        expect(returned.map((l) => l.what)).toContain(
            "Cheque 004512 went in the bank",
        );
        // Bounced already: neither Bounced nor Remove is offered again (#10).
        expect(returned.some((l) => l.bounceable ?? l.removable)).toBe(false);

        // A waiting cheque bounces from the money card, not the history.
        const waiting = historyLines(
            invoice({
                payments: [
                    { ...banked, bankStatus: "WAITING", clearedAt: null },
                ],
            }),
        );
        expect(waiting.some((l) => l.bounceable)).toBe(false);
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

describe("historyLines with who did it (U9 #1140)", () => {
    it("says issue, send, remind and void with Ravi's name, newest first, and no line twice", () => {
        const lines = historyLines(
            invoice({
                standing: "VOID",
                status: "VOID",
                voidedAt: at(-1),
                voidReason: "Billed twice",
                events: [
                    event({
                        kind: "VOIDED",
                        at: at(-1),
                        reason: "Billed twice",
                    }),
                    event({
                        kind: "REMINDED",
                        at: at(-5),
                        channel: "EMAIL",
                        messageId: "m2",
                        to: "asha@example.com",
                        status: "QUEUED",
                    }),
                    event({
                        kind: "SENT",
                        at: at(-20),
                        channel: "EMAIL",
                        messageId: "m1",
                        to: "asha@example.com",
                        status: "QUEUED",
                    }),
                    event({ kind: "ISSUED", at: at(-28) }),
                ],
                sent: [
                    {
                        id: "m2",
                        channel: "email",
                        to: "asha@example.com",
                        at: at(-5),
                        reminder: true,
                        status: "SENT",
                    },
                    {
                        id: "m1",
                        channel: "email",
                        to: "asha@example.com",
                        at: at(-20),
                        reminder: false,
                        status: "SENT",
                    },
                ],
            }),
            new Date(NOW),
        );
        expect(lines.map((l) => l.what)).toEqual([
            "Voided by Ravi Kumar: Billed twice",
            "Reminder sent by Ravi Kumar to asha@example.com",
            "Sent by Ravi Kumar to asha@example.com",
            "RC/26-27/0106 issued by Ravi Kumar",
            "Drafted",
        ]);
    });

    it("reads an automatic send and reminder as sent automatically", () => {
        const lines = historyLines(
            invoice({
                events: [
                    event({
                        kind: "AUTO_REMINDED",
                        actor: SAROH,
                        at: at(-2),
                        channel: "EMAIL",
                        to: "asha@example.com",
                    }),
                    event({
                        kind: "AUTO_SENT",
                        actor: SAROH,
                        at: at(-9),
                        channel: "EMAIL",
                        to: "asha@example.com",
                        thread: true,
                    }),
                ],
            }),
            new Date(NOW),
        );
        expect(lines.map((l) => l.what)).toContain(
            "Reminder sent automatically to asha@example.com",
        );
        expect(lines.map((l) => l.what)).toContain(
            "Sent automatically to asha@example.com and to their Messages",
        );
    });

    it("shows a bounced email and a failed pay attempt as gone wrong", () => {
        const lines = historyLines(
            invoice({
                events: [
                    event({
                        kind: "SEND_FAILED",
                        actor: SAROH,
                        at: at(-2),
                        to: "asha@example.com",
                        template: "INVOICE_SENT",
                    }),
                    event({
                        kind: "PAY_ATTEMPT_FAILED",
                        actor: { kind: "CUSTOMER", userId: null, name: null },
                        at: at(-3),
                    }),
                ],
            }),
            new Date(NOW),
        );
        expect(lines.slice(0, 2)).toEqual([
            expect.objectContaining({
                what: "Invoice to asha@example.com didn't go: the email provider refused it",
                tone: "bad",
            }),
            expect.objectContaining({
                what: "A payment on the pay page didn't go through",
                tone: "bad",
            }),
        ]);
    });

    it("says why a renewal's invoice wasn't sent automatically (U10), never blaming the provider", () => {
        const lines = historyLines(
            invoice({
                events: [
                    event({
                        kind: "SEND_FAILED",
                        actor: SAROH,
                        at: at(-2),
                        template: "INVOICE_SENT",
                        reason: "NO_EMAIL_PROVIDER",
                    }),
                    event({
                        kind: "SEND_FAILED",
                        actor: SAROH,
                        at: at(-3),
                        template: "INVOICE_SENT",
                        reason: "NO_EMAIL_ADDRESS",
                    }),
                    event({
                        kind: "SEND_FAILED",
                        actor: SAROH,
                        at: at(-4),
                        template: "INVOICE_SENT",
                        reason: "BUSINESS_DETAILS_MISSING",
                    }),
                ],
            }),
            new Date(NOW),
        );
        expect(lines.slice(0, 3)).toEqual([
            expect.objectContaining({
                what: "Invoice not sent automatically: no email provider is connected",
                tone: "bad",
            }),
            expect.objectContaining({
                what: "Invoice not sent automatically: there's no email address for them",
            }),
            expect.objectContaining({
                what: "Invoice not sent automatically: your business details aren't complete",
            }),
        ]);
    });

    it("dates a credit note with who made it, once", () => {
        const lines = historyLines(
            invoice({
                standing: "CREDITED",
                corrections: [
                    {
                        id: "cn_1",
                        kind: "CREDIT_NOTE",
                        number: "CN-0004",
                        total: "8400.00",
                    },
                ] as Invoice["corrections"],
                events: [
                    event({
                        kind: "CREDITED",
                        at: at(-2),
                        creditNoteId: "cn_1",
                        creditNoteNumber: "CN-0004",
                        reason: "Wrong rate",
                    }),
                    event({ kind: "REISSUED", at: at(-2), draftId: "inv_2" }),
                ],
            }),
            new Date(NOW),
        );
        const credit = lines.filter((l) => l.what.includes("Credit"));
        expect(credit).toHaveLength(1);
        expect(credit[0]).toMatchObject({ when: at(-2) });
        expect(credit[0]?.what).toMatch(
            /^Credit note CN-0004 for .*8,400.* by Ravi Kumar$/,
        );
        expect(lines.map((l) => l.what)).toContain(
            "Written again as a new draft by Ravi Kumar",
        );
    });

    it("leaves out a name it doesn't know, and names who shared it", () => {
        const lines = historyLines(
            invoice({
                events: [
                    event({
                        kind: "LINK_MADE",
                        at: at(-2),
                        actor: { kind: "USER", userId: "u_gone", name: null },
                        view: true,
                    }),
                ],
                shared: [
                    {
                        id: "s1",
                        channel: "PDF",
                        kind: "NEW",
                        byUserId: "u_ravi",
                        byName: "Ravi Kumar",
                        at: at(-1),
                    },
                ],
            }),
            new Date(NOW),
        );
        expect(lines[0]?.what).toBe("PDF downloaded by Ravi Kumar");
        expect(lines[1]?.what).toBe("New link made");
    });

    it("an older invoice with no events keeps its dates, without names", () => {
        const lines = historyLines(invoice(), new Date(NOW));
        expect(lines.map((l) => l.what)).toContain("RC/26-27/0106 issued");
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
