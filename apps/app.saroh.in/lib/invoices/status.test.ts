import { describe, expect, it } from "vitest";

import type { Invoice } from "./service";
import {
    billedTo,
    inTab,
    invoicePill,
    invoiceStatus,
    isOwed,
    owedSummary,
    sourceLabel,
    sourceLine,
    spacedCode,
    tabFromView,
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

describe("forWhat and invoiceMoney", async () => {
    const { forWhat, invoiceMoney } = await import("./money");

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

    it("always shows two decimals", () => {
        expect(invoiceMoney("2400", "INR")).toBe("₹2,400.00");
        expect(invoiceMoney("396.5", "INR")).toBe("₹396.50");
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
        expect(invoicePill(inv())).toEqual({ label: "Due", variant: "draft" });
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
        ).toBe("Not issued — no number yet");
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

describe("spacedCode", () => {
    it("sets an HSN the way the design does", () => {
        expect(spacedCode("19059010")).toBe("1905 90 10");
        expect(spacedCode("996813")).toBe("9968 13");
        expect(spacedCode(null)).toBe("");
    });
});
