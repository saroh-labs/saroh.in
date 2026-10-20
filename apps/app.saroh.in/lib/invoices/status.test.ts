import { describe, expect, it } from "vitest";

import type { Invoice, InvoicePayment } from "./service";
import {
    billedTo,
    headerPill,
    inTab,
    invoicePill,
    invoiceState,
    invoiceStatus,
    isOwed,
    lastLivePayment,
    lateBy,
    leftCents,
    moneyMessage,
    overdueLine,
    owedSummary,
    paidBy,
    paidCents,
    paidHow,
    paidSinceRows,
    sourceLabel,
    sourceLine,
    spacedCode,
    tabFromView,
    waitingCheque,
    whenLine,
    withCorrectionsUnder,
} from "./status";

const NOW = new Date("2026-09-22T10:00:00Z");
const day = (d: string) => `${d}T10:00:00.000Z`;

describe("invoiceStatus", () => {
    it("says Overdue for an issued invoice past its due date, with how long", () => {
        expect(
            invoiceStatus(
                { standing: "OVERDUE", dueAt: day("2026-09-19") },
                NOW,
            ),
        ).toEqual({
            label: "Overdue",
            variant: "error",
            detail: "3 days overdue",
        });
    });

    it("says when an issued invoice is due", () => {
        expect(
            invoiceStatus(
                { standing: "ISSUED", dueAt: day("2026-09-23") },
                NOW,
            ),
        ).toEqual({ label: "Issued", variant: "info", detail: "Due tomorrow" });
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt: day("2026-09-22") }, NOW)
                .detail,
        ).toBe("Due today");
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt: day("2026-09-29") }, NOW)
                .detail,
        ).toBe("Due in 7 days");
    });

    it("says Paid, Draft and Void plainly", () => {
        expect(
            invoiceStatus({ standing: "PAID", dueAt: null }, NOW).label,
        ).toBe("Paid");
        expect(invoiceStatus({ standing: "DRAFT", dueAt: null }, NOW)).toEqual({
            label: "Draft",
            variant: "neutral",
            detail: null,
        });
        expect(
            invoiceStatus({ standing: "VOID", dueAt: null }, NOW).label,
        ).toBe("Void");
    });

    it("agrees with the due date shown in a timezone behind UTC", () => {
        // Due 25 Sep, end of day in New York: 04:59 on the 26th in UTC.
        const dueAt = "2026-09-26T03:59:59.999Z";
        // 24 Sep, 9pm in New York.
        const eveningBefore = new Date("2026-09-25T01:00:00Z");
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt }, eveningBefore).detail,
        ).toBe("Due tomorrow");
        // 25 Sep, 9pm in New York: still the due day.
        const dueEvening = new Date("2026-09-26T01:00:00Z");
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt }, dueEvening).detail,
        ).toBe("Due today");
        // 26 Sep, 10am in New York: a day late.
        const nextMorning = new Date("2026-09-26T14:00:00Z");
        expect(
            invoiceStatus({ standing: "OVERDUE", dueAt }, nextMorning).detail,
        ).toBe("1 day overdue");
    });

    it("says overdue by one day in the singular", () => {
        expect(
            invoiceStatus(
                { standing: "OVERDUE", dueAt: day("2026-09-21") },
                NOW,
            ).detail,
        ).toBe("1 day overdue");
    });
});

describe("billedTo", () => {
    it("reads the bill-to copied on issue, even after the contact is gone", () => {
        expect(
            billedTo({
                contact: null,
                billTo: { name: "Asha Rao", email: "asha@example.com" },
            }),
        ).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
            contactId: null,
        });
    });

    it("reads the contact on a draft, which has no bill-to yet", () => {
        expect(
            billedTo({
                contact: {
                    id: "c_1",
                    name: "Asha Rao",
                    email: "asha@example.com",
                },
                billTo: null,
            }),
        ).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
            contactId: "c_1",
        });
    });

    it("says so when there is nobody to bill", () => {
        expect(billedTo({ contact: null, billTo: null }).name).toBe(
            "No one chosen",
        );
    });
});

describe("sourceLabel", () => {
    it("names what an invoice is for", () => {
        expect(sourceLabel("SUBSCRIPTION")).toBe("Membership");
        expect(sourceLabel("PACK")).toBe("Class pack");
        // ADR-008: an order's paper, and one cancelled by a credit note.
        expect(sourceLabel("ORDER")).toBe("Order");
        expect(invoiceStatus({ standing: "CREDITED", dueAt: null }).label).toBe(
            "Credited",
        );
        expect(sourceLabel("COURSE")).toBe("Course");
        expect(sourceLabel("MANUAL")).toBe("Entered by hand");
    });
});

describe("forWhat", async () => {
    const { forWhat } = await import("./money");

    it("says what an invoice is for from its first line", () => {
        expect(
            forWhat({
                description: "Personal training",
                quantity: 4,
                lineCount: 1,
            }),
        ).toBe("Personal training × 4");
        expect(
            forWhat({
                description: "Personal training",
                quantity: 4,
                lineCount: 3,
            }),
        ).toBe("Personal training + 2 more");
        expect(forWhat(null)).toBe("No lines yet");
    });
});

/** An invoice as the list reads it, with only what a test says changed. */
function inv(over: Partial<Invoice> = {}): Invoice {
    return {
        id: "i1",
        number: "RC/26-27/0001",
        status: "ISSUED",
        standing: "ISSUED",
        kind: "INVOICE",
        related: null,
        corrections: [],
        order: null,
        contact: { id: "c1", name: "Shruti Menon", email: "s@x.in" },
        billTo: { name: "Shruti Menon", email: "s@x.in" },
        currency: "INR",
        subtotal: "100.00",
        tax: "0.00",
        total: "118.00",
        issuedAt: day("2026-09-10"),
        dueAt: day("2026-09-24"),
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
        createdAt: day("2026-09-10"),
        updatedAt: day("2026-09-10"),
        summary: {
            description: "Sourdough loaf (trade)",
            quantity: 12,
            lineCount: 2,
        },
        ...over,
    };
}

describe("the Invoices design's words", () => {
    it("says Due for an issued invoice and Overdue once past its date", () => {
        expect(invoicePill(inv())).toEqual({ label: "Due", variant: "active" });
        expect(invoicePill(inv({ standing: "OVERDUE" }))).toEqual({
            label: "Overdue",
            variant: "error",
        });
    });

    it("says Refunded for an order's credited invoice and Cancelled for any other", () => {
        expect(
            invoicePill(inv({ standing: "CREDITED", source: "ORDER" })).label,
        ).toBe("Refunded");
        expect(invoicePill(inv({ standing: "CREDITED" })).label).toBe(
            "Cancelled",
        );
    });

    it("calls a credit note a credit note, whatever its standing", () => {
        expect(invoicePill(inv({ kind: "CREDIT_NOTE" })).label).toBe(
            "Credit note",
        );
    });

    it("counts down to the due date and up from it", () => {
        expect(whenLine(inv(), NOW)).toMatchObject({
            before: "Due ",
            date: day("2026-09-24"),
            after: " · in 2 days",
        });
        expect(
            whenLine(
                inv({ standing: "OVERDUE", dueAt: day("2026-09-19") }),
                NOW,
            ),
        ).toMatchObject({ before: "3 days late", late: true });
        expect(
            whenLine(inv({ standing: "DRAFT", number: null }), NOW).before,
        ).toBe("Not issued, no number yet");
    });

    it("says how a paid invoice was paid", () => {
        const paid = inv({
            standing: "PAID",
            paidAt: day("2026-09-18"),
            payment: { method: "UPI", reference: null, note: null },
        });
        expect(whenLine(paid, NOW)).toMatchObject({
            before: "Paid ",
            after: " · UPI",
        });
    });

    it("names where it came from", () => {
        expect(
            sourceLine(
                inv({ source: "ORDER", order: { id: "o", number: "1020" } }),
            ),
        ).toBe("Order #1020");
        expect(
            sourceLine(
                inv({
                    source: "SUBSCRIPTION",
                    summary: {
                        description:
                            "Sourdough, monthly · 12 Sep – 11 Oct 2026",
                        quantity: 1,
                        lineCount: 1,
                    },
                }),
            ),
        ).toBe("Sourdough, monthly subscription");
        expect(sourceLine(inv())).toBe("Written by hand");
        expect(
            sourceLine(
                inv({
                    kind: "CREDIT_NOTE",
                    related: { id: "i0", number: "RC/26-27/0105" },
                }),
            ),
        ).toBe("Credit note for RC/26-27/0105");
    });
});

describe("tabs", () => {
    it("reads the old ?view= names", () => {
        expect(tabFromView("issued")).toBe("due");
        expect(tabFromView("overdue")).toBe("overdue");
        expect(tabFromView("void")).toBe("all");
        expect(tabFromView(undefined)).toBe("all");
    });

    it("never overlaps Due and Overdue, and keeps refunds with Paid", () => {
        const overdue = inv({ standing: "OVERDUE" });
        expect(inTab(overdue, "overdue")).toBe(true);
        expect(inTab(overdue, "due")).toBe(false);
        expect(inTab(inv({ standing: "CREDITED" }), "paid")).toBe(true);
    });

    it("leaves credit notes out of every tab but All", () => {
        const note = inv({ kind: "CREDIT_NOTE" });
        expect(inTab(note, "all")).toBe(true);
        expect(inTab(note, "due")).toBe(false);
    });
});

describe("owed", () => {
    it("adds what is due and overdue, and names what is overdue", () => {
        const s = owedSummary([
            inv({ total: "8400.00" }),
            inv({ standing: "OVERDUE", total: "11250.00" }),
            inv({ standing: "PAID", total: "999.00" }),
        ]);
        expect(s.owed).toEqual([{ currency: "INR", cents: 1965000 }]);
        expect(s.overdue).toEqual([{ currency: "INR", cents: 1125000 }]);
        expect(s.overdueCount).toBe(1);
    });

    it("counts a partly paid invoice at what is left to pay (DEC-173)", () => {
        const s = owedSummary([
            inv({ total: "2500.00", leftToPay: "1500.00" }),
            inv({ standing: "OVERDUE", total: "1000.00", leftToPay: "400.00" }),
        ]);
        expect(s.owed).toEqual([{ currency: "INR", cents: 190000 }]);
        expect(s.overdue).toEqual([{ currency: "INR", cents: 40000 }]);
    });

    it("never counts a credit note or an order's paper as owed", () => {
        expect(isOwed(inv({ kind: "CREDIT_NOTE" }))).toBe(false);
        expect(
            isOwed(inv({ source: "ORDER", order: { id: "o", number: "1" } })),
        ).toBe(false);
        expect(owedSummary([inv({ kind: "CREDIT_NOTE" })]).owed).toEqual([]);
    });

    it("keeps currencies apart", () => {
        const s = owedSummary([
            inv(),
            inv({ currency: "USD", total: "10.00" }),
        ]);
        expect(s.owed).toEqual([
            { currency: "INR", cents: 11800 },
            { currency: "USD", cents: 1000 },
        ]);
    });
});

describe("withCorrectionsUnder", () => {
    it("puts a credit note straight under the invoice it corrects", () => {
        const a = inv({ id: "a" });
        const note = inv({
            id: "n",
            kind: "CREDIT_NOTE",
            related: { id: "b", number: "B" },
        });
        const b = inv({ id: "b" });
        expect(withCorrectionsUnder([note, a, b]).map((r) => r.id)).toEqual([
            "a",
            "b",
            "n",
        ]);
    });

    it("leaves a correction where it is when its invoice is not listed", () => {
        const note = inv({
            id: "n",
            kind: "CREDIT_NOTE",
            related: { id: "gone", number: "X" },
        });
        expect(withCorrectionsUnder([note]).map((r) => r.id)).toEqual(["n"]);
    });
});

describe("paidSinceRows", () => {
    const since = new Date("2026-09-21T10:00:00Z");
    const inv = (id: string, over: Record<string, unknown> = {}) => ({
        id,
        kind: "INVOICE" as const,
        paidAt: day("2026-09-22"),
        ...over,
    });

    it("shows the API's own paid-since rows, finding one past the capped page (H-7)", () => {
        // Made months ago, paid this morning: not on the newest page.
        const old = inv("inv_old");
        expect(
            paidSinceRows([inv("inv_new")], [old, inv("inv_new")], since).map(
                (i) => i.id,
            ),
        ).toEqual(["inv_old", "inv_new"]);
    });

    it("filters what is on hand when the API couldn't answer, never a credit note", () => {
        const onHand = [
            inv("paid"),
            inv("earlier", { paidAt: day("2026-09-01") }),
            inv("unpaid", { paidAt: null }),
            inv("cn", { kind: "CREDIT_NOTE" }),
        ];
        expect(paidSinceRows(onHand, null, since).map((i) => i.id)).toEqual([
            "paid",
        ]);
        // No window: every invoice on hand.
        expect(paidSinceRows(onHand, null, null)).toBe(onHand);
    });
});

describe("spacedCode", () => {
    it("sets an HSN the way the design does", () => {
        expect(spacedCode("19059010")).toBe("1905 90 10");
        expect(spacedCode("996813")).toBe("9968 13");
        expect(spacedCode(null)).toBe("");
    });
});

describe("paidHow", () => {
    it("reads inside a sentence, keeping UPI's capitals", () => {
        expect(paidHow("ONLINE")).toBe("online");
        expect(paidHow("UPI")).toBe("by UPI");
        expect(paidHow("CASH")).toBe("by cash");
        expect(paidHow("BANK_TRANSFER")).toBe("by bank transfer");
        expect(paidHow("ORDER")).toBe("with the order");
    });
});

/* ------------------------------------------------------------------------
 * The ledger's states (DEC-173, U7 #1119)
 * ---------------------------------------------------------------------- */

const ZONE = "Asia/Kolkata";
/** 20 Oct 2026, mid-morning in India: Vivek's invoice is 13 days late. */
const OCT20 = new Date("2026-10-20T05:00:00Z");
const VIVEK = {
    number: "RC/26-27/0106",
    total: "8400.00",
    issuedAt: "2026-09-22T05:37:00Z",
    // The end of 7 Oct in India.
    dueAt: "2026-10-07T18:29:59.999Z",
};

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
    id: "chq",
    amount: "8400.00",
    method: "CHEQUE",
    cheque: { number: "004512", bank: "HDFC Bank" },
    bankStatus: "WAITING",
    receivedAt: "2026-10-19T06:00:00Z",
});

/** Each state, as the detail read sends it. */
const S = {
    draft: inv({
        ...VIVEK,
        standing: "DRAFT",
        status: "DRAFT",
        number: null,
        total: "7500.00",
        issuedAt: null,
    }),
    due: inv({
        ...VIVEK,
        dueAt: "2026-10-27T18:29:59.999Z",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
    }),
    overdue: inv({
        ...VIVEK,
        standing: "OVERDUE",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
    }),
    partlyPaid: inv({
        ...VIVEK,
        dueAt: "2026-10-27T18:29:59.999Z",
        partlyPaid: true,
        leftToPay: "4400.00",
        paidSoFar: "4000.00",
        payments: [pay()],
    }),
    partlyPaidLate: inv({
        ...VIVEK,
        standing: "OVERDUE",
        partlyPaid: true,
        leftToPay: "4400.00",
        paidSoFar: "4000.00",
        payments: [pay()],
    }),
    paid: inv({
        ...VIVEK,
        standing: "PAID",
        status: "PAID",
        paidAt: "2026-10-15T06:00:00Z",
        leftToPay: "0.00",
        paidSoFar: "8400.00",
        payment: {
            method: "BANK_TRANSFER",
            reference: "UTR 4581 2290",
            note: null,
        },
        payments: [
            pay({
                amount: "8400.00",
                method: "BANK_TRANSFER",
                reference: "UTR 4581 2290",
                receivedAt: "2026-10-15T06:00:00Z",
            }),
        ],
    }),
    paidChequeWaiting: inv({
        ...VIVEK,
        standing: "PAID",
        status: "PAID",
        chequeWaiting: true,
        paidAt: "2026-10-19T06:00:00Z",
        leftToPay: "0.00",
        paidSoFar: "8400.00",
        payments: [CHEQUE],
    }),
    void: inv({
        ...VIVEK,
        standing: "VOID",
        status: "VOID",
        leftToPay: "0.00",
    }),
    credited: inv({ ...VIVEK, standing: "CREDITED", leftToPay: "0.00" }),
    orderInvoice: inv({
        ...VIVEK,
        standing: "PAID",
        status: "PAID",
        source: "ORDER",
        order: { id: "o1", number: "1020" },
        paidAt: "2026-10-15T06:00:00Z",
        payment: { method: "ORDER", reference: null, note: null } as never,
    }),
    creditNote: inv({
        ...VIVEK,
        number: "RCCN/26-27/0002",
        kind: "CREDIT_NOTE",
        related: { id: "i0", number: "RC/26-27/0106" },
    }),
};

describe("invoiceState: one per row of U7's table", () => {
    it("names each state", () => {
        expect(invoiceState(S.draft)).toBe("draft");
        expect(invoiceState(S.due)).toBe("due");
        expect(invoiceState(S.overdue)).toBe("overdue");
        expect(invoiceState(S.partlyPaid)).toBe("partlyPaid");
        expect(invoiceState(S.partlyPaidLate)).toBe("partlyPaid");
        expect(invoiceState(S.paid)).toBe("paid");
        expect(invoiceState(S.paidChequeWaiting)).toBe("paidChequeWaiting");
        expect(invoiceState(S.void)).toBe("void");
        expect(invoiceState(S.credited)).toBe("credited");
        expect(invoiceState(S.orderInvoice)).toBe("paid");
        expect(invoiceState(S.creditNote)).toBe("creditNote");
    });

    it("reads an API before the ledger: no partlyPaid or chequeWaiting", () => {
        expect(invoiceState({ standing: "ISSUED", kind: "INVOICE" })).toBe(
            "due",
        );
        expect(invoiceState({ standing: "PAID" })).toBe("paid");
    });
});

describe("invoicePill with the ledger", () => {
    it("Partly paid, and Paid · cheque not in the bank", () => {
        expect(invoicePill(S.partlyPaid)).toEqual({
            label: "Partly paid",
            variant: "active",
        });
        expect(invoicePill(S.paidChequeWaiting)).toEqual({
            label: "Paid · cheque not in the bank",
            variant: "active",
        });
    });

    it("a late invoice stays Overdue however much is paid", () => {
        expect(invoicePill(S.partlyPaidLate).label).toBe("Overdue");
    });

    it("the header says how late: Overdue · 13 days", () => {
        expect(headerPill(S.overdue, OCT20).label).toBe("Overdue · 13 days");
        expect(headerPill(S.due, OCT20).label).toBe("Due");
        expect(headerPill(S.creditNote, OCT20).label).toBe("Credit note");
    });
});

describe("what is unpaid on a late invoice", () => {
    it("₹8,400 unpaid · 13 days late", () => {
        expect(overdueLine(S.overdue, OCT20)).toBe(
            "₹8,400 unpaid · 13 days late",
        );
    });

    it("says what is left, not the total", () => {
        expect(overdueLine(S.partlyPaidLate, OCT20)).toBe(
            "₹4,400 unpaid · 13 days late",
        );
    });

    it("one day late, in the singular", () => {
        expect(overdueLine(S.overdue, new Date("2026-10-08T05:00:00Z"))).toBe(
            "₹8,400 unpaid · 1 day late",
        );
    });

    it("nothing on one that isn't late", () => {
        expect(overdueLine(S.due, OCT20)).toBeNull();
        expect(overdueLine(S.paid, OCT20)).toBeNull();
    });

    it("lateBy counts whole days, and never 0 on an overdue one", () => {
        expect(lateBy(S.overdue, OCT20)).toBe(13);
        expect(lateBy({ standing: "OVERDUE", dueAt: null }, OCT20)).toBe(1);
        expect(lateBy(S.due, OCT20)).toBe(0);
    });
});

describe("leftCents and paidCents", () => {
    it("read the API's ledger fields", () => {
        expect(leftCents(S.partlyPaid)).toBe(440_000);
        expect(paidCents(S.partlyPaid)).toBe(400_000);
    });

    it("from an API before the ledger: the total while owed, all once paid", () => {
        const old = inv({ total: "118.00" });
        expect(leftCents(old)).toBe(11_800);
        expect(paidCents(old)).toBe(0);
        expect(paidCents(inv({ standing: "PAID", total: "118.00" }))).toBe(
            11_800,
        );
    });

    it("nothing is left on paper that isn't owed", () => {
        expect(leftCents(S.paid)).toBe(0);
        expect(leftCents(S.void)).toBe(0);
        expect(leftCents(S.creditNote)).toBe(0);
    });
});

describe("the ledger's payments", () => {
    it("the last one that counts: not removed, not bounced", () => {
        const kept = pay({ id: "a" });
        const removed = pay({
            id: "b",
            removed: { at: "2026-10-13T06:00:00Z", reason: null },
        });
        const bounced = pay({ ...CHEQUE, id: "c", bankStatus: "BOUNCED" });
        expect(lastLivePayment([kept, removed, bounced])?.id).toBe("a");
        expect(lastLivePayment(undefined)).toBeNull();
    });

    it("the cheque waiting for the bank", () => {
        expect(waitingCheque([pay(), CHEQUE])?.id).toBe("chq");
        expect(
            waitingCheque([{ ...CHEQUE, bankStatus: "CLEARED" }]),
        ).toBeNull();
        expect(
            waitingCheque([
                { ...CHEQUE, removed: { at: CHEQUE.receivedAt, reason: null } },
            ]),
        ).toBeNull();
    });

    it("a cheque is paid by cheque", () => {
        expect(paidBy("CHEQUE")).toBe("Cheque");
        expect(paidHow("CHEQUE")).toBe("by cheque");
    });
});

describe("moneyMessage: one message per state (INVPageA, INVRecordPlus)", () => {
    const say = (i: Invoice) => moneyMessage(i, { timeZone: ZONE, now: OCT20 });

    it("overdue: ₹8,400 to collect · 13 days late · due 7 Oct", () => {
        expect(say(S.overdue)).toEqual({
            title: "₹8,400 to collect",
            detail: "13 days late · due 7 Oct",
            tone: "late",
        });
    });

    it("due: to collect, and Not paid yet", () => {
        expect(say(S.due)).toEqual({
            title: "₹8,400 to collect",
            detail: "Due 27 Oct. Not paid yet. When the money comes in, record it.",
            tone: "owed",
        });
    });

    it("partly paid: what is left, and what came in how", () => {
        expect(say(S.partlyPaid)).toEqual({
            title: "₹4,400 left to pay",
            detail: "Paid ₹4,000 of ₹8,400 · cash on 12 Oct",
            tone: "owed",
        });
        expect(say(S.partlyPaidLate)).toEqual({
            title: "₹4,400 left to pay",
            detail: "Paid ₹4,000 of ₹8,400 · cash on 12 Oct · 13 days late",
            tone: "late",
        });
    });

    it("paid: by bank transfer, with its reference", () => {
        expect(say(S.paid)).toEqual({
            title: "Paid ₹8,400",
            detail: "By bank transfer on 15 Oct · ref UTR 4581 2290",
            tone: "paid",
        });
    });

    it("paid, from an API before the ledger: the row's own payment", () => {
        expect(say({ ...S.paid, payments: undefined }).detail).toBe(
            "By bank transfer on 15 Oct · ref UTR 4581 2290",
        );
    });

    it("paid in cash, or online", () => {
        const cash = {
            ...S.paid,
            payments: [
                pay({ amount: "8400.00", receivedAt: "2026-10-15T06:00:00Z" }),
            ],
        };
        expect(say(cash).detail).toBe("In cash on 15 Oct");
        const online = {
            ...S.paid,
            payments: [
                pay({
                    amount: "8400.00",
                    method: "ONLINE",
                    receivedAt: "2026-10-15T06:00:00Z",
                }),
            ],
        };
        expect(say(online).detail).toBe("Online on 15 Oct");
    });

    it("a cheque not in the bank", () => {
        expect(say(S.paidChequeWaiting)).toEqual({
            title: "Cheque not in the bank",
            detail: "Paid ₹8,400 · Cheque 004512 · HDFC Bank · received 19 Oct",
            tone: "waiting",
        });
    });

    it("a draft", () => {
        expect(say(S.draft)).toEqual({
            title: "Draft · ₹7,500",
            detail: "No number yet. Issuing numbers it and locks the lines.",
            tone: "neutral",
        });
    });

    it("void, credited, an order's paper and a credit note owe nothing", () => {
        expect(say(S.void).title).toBe("Void");
        expect(say(S.credited)).toMatchObject({
            title: "Cancelled",
            detail: "A credit note cancels it. Nothing is owed.",
        });
        expect(
            say({ ...S.credited, order: { id: "o", number: "1" } }).title,
        ).toBe("Refunded on the order");
        expect(say(S.orderInvoice)).toMatchObject({
            title: "Paid ₹8,400",
            detail: "With the order. Its payments and refunds are made on the order.",
        });
        expect(say(S.creditNote)).toEqual({
            title: "Credit note · ₹8,400",
            detail: "Nothing is owed on it. It cancels RC/26-27/0106.",
            tone: "neutral",
        });
    });
});
