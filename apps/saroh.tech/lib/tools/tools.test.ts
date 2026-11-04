import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";

import { addDays, daysBetween, formatDate, todayIso } from "./dates";
import type { DocDraft } from "./document";
import { applyCarry, documentView, dueFor, totals } from "./document";
import { carryHref, decodeDraft, encodeDraft } from "./handoff";
import { lateFee } from "./late-fee";
import { formatMoney, parseNumber, toCents } from "./money";
import { canDrawPdf, drawPdf } from "./pdf";
import { applyReceiptCarry, receiptView, taxIncluded } from "./receipt";
import {
    applyReminderCarry,
    daysOverdue,
    openHref,
    reminderMessage,
} from "./reminder";
import { taxBreakdown } from "./tax";

const draft = (over: Partial<DocDraft> = {}): DocDraft => ({
    number: "INV-0007",
    issued: "2026-12-01",
    due: "2026-12-31",
    terms: "net30",
    currency: "GBP",
    clientName: "Northwind Supply Ltd",
    clientEmail: "ap@example.com",
    clientAddress: "",
    items: [
        {
            id: "a",
            description: "Brand identity design",
            qty: "1",
            rate: "1,200.00",
        },
        { id: "b", description: "Website pages", qty: "5", rate: "180.00" },
        { id: "c", description: "Extra revisions", qty: "3", rate: "60.00" },
    ],
    taxes: [{ id: "t", name: "VAT", rate: "20" }],
    discount: null,
    discountMode: "percent",
    depositPaid: null,
    payLink: "",
    bank: "",
    note: "",
    style: "plain",
    estimate: false,
    depositPlan: "none",
    depositAmount: "",
    termsText: "",
    signLine: false,
    ...over,
});

const from = {
    logo: "",
    name: "Lumen Studio",
    email: "hello@example.com",
    address: "12 Example Road",
    taxId: "GB123456789",
};

describe("money", () => {
    it("reads what people type", () => {
        expect(parseNumber("1,200.50")).toBe(1200.5);
        expect(parseNumber("$850")).toBe(850);
        expect(parseNumber("")).toBe(0);
        expect(parseNumber("abc")).toBe(0);
    });

    it("rounds half up, despite floats", () => {
        expect(toCents(1.005)).toBe(101);
        expect(toCents(0.1 + 0.2)).toBe(30);
    });

    it("writes the right symbol and two decimals", () => {
        expect(formatMoney(273600, "GBP")).toBe("£2,736.00");
        expect(formatMoney(24000, "AUD")).toBe("A$240.00");
        expect(formatMoney(5, "USD")).toBe("$0.05");
        expect(formatMoney(123456789, "EUR")).toBe("€1,234,567.89");
    });
});

describe("dates", () => {
    it("adds days across months, and counts them back", () => {
        expect(addDays("2026-12-01", 30)).toBe("2026-12-31");
        expect(addDays("2026-12-20", 14)).toBe("2027-01-03");
        expect(daysBetween("2026-11-15", "2026-11-27")).toBe(12);
        expect(daysBetween("2026-11-27", "2026-11-15")).toBe(-12);
    });

    it("doesn't slip a day in any time zone", () => {
        expect(formatDate("2026-12-01")).toBe("1 Dec 2026");
        expect(formatDate("")).toBe("");
        expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    it("works the due date out from the terms", () => {
        expect(dueFor("2026-12-01", "net30", "")).toBe("2026-12-31");
        expect(dueFor("2026-12-01", "net14", "")).toBe("2026-12-15");
        expect(dueFor("2026-12-01", "receipt", "")).toBe("2026-12-01");
        expect(dueFor("2026-12-01", "custom", "2027-02-02")).toBe("2027-02-02");
    });
});

describe("invoice totals", () => {
    it("adds up as the board's example does", () => {
        const t = totals(draft());
        expect(t.subtotal).toBe(228000);
        expect(t.taxes[0].amount).toBe(45600);
        expect(t.total).toBe(273600);
        expect(t.due).toBe(273600);
    });

    it("takes a discount before tax, and a deposit after", () => {
        const percent = totals(draft({ discount: "10" }));
        expect(percent.discount).toBe(22800);
        expect(percent.taxes[0].amount).toBe(41040);
        expect(percent.total).toBe(246240);
        const amount = totals(
            draft({
                discount: "100",
                discountMode: "amount",
                depositPaid: "500",
            }),
        );
        expect(amount.discount).toBe(10000);
        expect(amount.total).toBe(261600);
        expect(amount.depositPaid).toBe(50000);
        expect(amount.due).toBe(211600);
    });

    it("adds each tax line on the same amount", () => {
        const t = totals(
            draft({
                taxes: [
                    { id: "1", name: "GST", rate: "5" },
                    { id: "2", name: "PST", rate: "7" },
                ],
            }),
        );
        expect(t.taxes.map((x) => x.amount)).toEqual([11400, 15960]);
        expect(t.total).toBe(255360);
    });

    it("never takes off more than there is", () => {
        const t = totals(
            draft({
                discount: "999999",
                discountMode: "amount",
                depositPaid: "5",
            }),
        );
        expect(t.discount).toBe(228000);
        expect(t.total).toBe(0);
        expect(t.due).toBe(0);
    });

    it("handles an empty invoice and part quantities", () => {
        expect(totals(draft({ items: [] })).total).toBe(0);
        const half = totals(
            draft({
                taxes: [],
                items: [
                    { id: "x", description: "", qty: "1.5", rate: "33.33" },
                ],
            }),
        );
        expect(half.total).toBe(5000);
    });
});

describe("a quote", () => {
    const quote = draft({
        currency: "USD",
        taxes: [],
        depositPlan: "30",
        items: [
            { id: "a", description: "Call-out", qty: "1", rate: "60" },
            { id: "b", description: "Labour", qty: "2", rate: "85" },
            { id: "c", description: "Tap and fittings", qty: "1", rate: "140" },
            {
                id: "d",
                description: "Extra tap",
                qty: "1",
                rate: "50",
                optional: true,
            },
        ],
    });

    it("leaves optional extras out of the total, and works out the deposit", () => {
        const t = totals(quote);
        expect(t.total).toBe(37000);
        expect(t.extras).toBe(5000);
        expect(t.depositDue).toBe(11100);
    });

    it("takes a typed deposit, up to the total", () => {
        const set = { ...quote, depositPlan: "amount" as const };
        expect(totals({ ...set, depositAmount: "100" }).depositDue).toBe(10000);
        expect(totals({ ...set, depositAmount: "9000" }).depositDue).toBe(
            37000,
        );
    });

    it("is headed by what they chose to call it", () => {
        expect(documentView("quote", quote, from).heading).toBe("Quote");
        const est = documentView("quote", { ...quote, estimate: true }, from);
        expect(est.heading).toBe("Estimate");
        expect(est.totals.at(-2)?.label).toBe("Estimate total");
    });
});

describe("the invoice view", () => {
    it("shows the board's totals, and only what's filled in", () => {
        const v = documentView("invoice", draft(), { ...from, address: "" });
        expect(v.totals.map((t) => t.value)).toEqual([
            "£2,280.00",
            "£456.00",
            "£2,736.00",
        ]);
        expect(v.parties[0].lines).toEqual([
            "Lumen Studio",
            "hello@example.com",
            "VAT GB123456789",
        ]);
        expect(v.fileName).toBe("INV-0007.pdf");
    });

    it("leaves out a tax line nobody filled in", () => {
        const v = documentView(
            "invoice",
            draft({ taxes: [{ id: "t", name: "", rate: "" }] }),
            from,
        );
        expect(v.totals.map((t) => t.label)).toEqual(["Subtotal", "Total due"]);
    });

    it("gives an odd number a safe file name", () => {
        const v = documentView("invoice", draft({ number: "../a b" }), from);
        expect(v.fileName).toBe("-a-b.pdf");
    });
});

describe("tax", () => {
    it("adds tax", () => {
        expect(taxBreakdown("add", 10000, 20)).toEqual({
            net: 10000,
            tax: 2000,
            gross: 12000,
        });
    });

    it("takes it out of a total, not 20% off", () => {
        expect(taxBreakdown("remove", 12000, 20)).toEqual({
            net: 10000,
            tax: 2000,
            gross: 12000,
        });
    });

    it("always adds back up", () => {
        for (const [amount, rate] of [
            [9999, 7],
            [1, 19],
            [33333, 23],
            [10000, 0],
        ]) {
            const b = taxBreakdown("remove", amount, rate);
            expect(b.net + b.tax).toBe(b.gross);
        }
    });

    it("finds the tax inside a receipt's amount", () => {
        expect(taxIncluded(24000, 10)).toBe(2182);
    });
});

describe("late fees", () => {
    const base = { amount: 120000, rate: 1.5, daysLate: 45, graceDays: 0 };

    it("charges by the month, the year or flat", () => {
        expect(lateFee({ ...base, type: "month" }).fee).toBe(2700);
        expect(lateFee({ ...base, type: "year" }).fee).toBe(222);
        const flat = lateFee({ ...base, type: "flat", rate: 2500 });
        expect(flat.fee).toBe(2500);
        expect(flat.total).toBe(122500);
    });

    it("takes off grace days, and charges nothing inside them", () => {
        const after = lateFee({ ...base, type: "month", graceDays: 15 });
        expect(after.charged).toBe(30);
        expect(after.fee).toBe(1800);
        const inside = lateFee({
            ...base,
            type: "flat",
            rate: 2500,
            graceDays: 60,
        });
        expect(inside).toEqual({ charged: 0, fee: 0, total: 120000 });
    });
});

describe("reminders", () => {
    const d = {
        client: "Jordan",
        sender: "Maya",
        number: "INV-0042",
        amount: "$850.00",
        wasDue: "2026-11-15",
        payBy: "2026-12-02",
        payLink: "https://example.com/pay",
        tone: "friendly" as const,
        channel: "email" as const,
    };
    const today = "2026-11-27";

    it("counts the days overdue, never below zero", () => {
        expect(daysOverdue(d.wasDue, today)).toBe(12);
        expect(daysOverdue("2026-12-15", today)).toBe(0);
        expect(daysOverdue("", today)).toBe(0);
    });

    it("writes each tone in the board's words", () => {
        expect(reminderMessage(d, today).subject).toBe(
            "Invoice INV-0042: a friendly reminder",
        );
        const firm = reminderMessage({ ...d, tone: "firm" }, today);
        expect(firm.subject).toBe("Invoice INV-0042 is 12 days overdue");
        expect(firm.body).toContain("Please pay by 2 Dec");
        const final = reminderMessage({ ...d, tone: "final" }, today);
        expect(final.subject).toBe("Final reminder: invoice INV-0042");
        expect(final.body).toContain("late fee in our terms");
    });

    it("has no subject on WhatsApp", () => {
        const m = reminderMessage({ ...d, channel: "whatsapp" }, today);
        expect(m.subject).toBe("");
        expect(m.body).toContain("https://example.com/pay");
    });

    it("drops the link cleanly, and invents nothing", () => {
        const m = reminderMessage(
            { ...d, payLink: "", client: "", wasDue: "" },
            today,
        );
        expect(m.body).not.toContain("link to pay");
        expect(m.body).toContain("[first name]");
        expect(m.body).toContain("[due date]");
    });

    it("opens the person's own app with the words escaped", () => {
        const email = openHref("email", {
            subject: "A & B",
            body: "Hi\nthere",
        });
        expect(email).toBe("mailto:?subject=A%20%26%20B&body=Hi%0Athere");
        const wa = openHref("whatsapp", { subject: "", body: "Hi there" });
        expect(wa).toBe("https://wa.me/?text=Hi%20there");
    });
});

describe("the hand-off", () => {
    it("carries any language, safely in an address", () => {
        const draft = { name: "सारोह & Søn", items: [{ a: 1 }] };
        const coded = encodeDraft(draft);
        expect(coded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeDraft(coded)).toEqual(draft);
    });

    it("ignores a fragment that isn't a draft", () => {
        expect(decodeDraft("%%%")).toBeNull();
        expect(decodeDraft("aGVsbG8")).toBeNull();
    });

    it("carries a line into another tool", () => {
        const href = carryHref("/tools/invoice-generator", { taxes: [] });
        expect(href.startsWith("/tools/invoice-generator#carry=")).toBe(true);
    });
});

describe("carrying into the invoice generator", () => {
    it("adds a line to what's there, and drops an empty first row", () => {
        const d = draft({
            items: [{ id: "e", description: "", qty: "1", rate: "" }],
        });
        const patch = applyCarry(d, {
            items: [{ description: "Late fee", qty: "1", rate: "27.00" }],
            currency: "USD",
        });
        expect(patch.items?.map((i) => i.description)).toEqual(["Late fee"]);
        expect(patch.currency).toBe("USD");
    });

    it("takes only known fields, as text", () => {
        const patch = applyCarry(draft(), {
            number: "hacked",
            style: "x",
            currency: "XXX",
            clientName: 5,
            taxes: [null, "x", { name: "VAT", rate: 20 }],
        });
        expect(Object.keys(patch)).toEqual(["taxes"]);
        expect(patch.taxes?.[0].rate).toBe("");
        expect(applyCarry(draft(), "nope")).toEqual({});
    });

    it("takes a template's estimate flag and deposit", () => {
        expect(
            applyCarry(draft(), { estimate: true, depositPaid: "600" }),
        ).toEqual({ estimate: true, depositPaid: "600" });
    });
});

describe("carrying into the receipt and reminder tools", () => {
    it("takes only known fields, as text", () => {
        expect(
            applyReceiptCarry({
                amount: "460.00",
                currency: "GBP",
                paidFor: "Classes",
                number: 7,
                hacked: "x",
            }),
        ).toEqual({ amount: "460.00", currency: "GBP", paidFor: "Classes" });
        expect(applyReceiptCarry({ currency: "XXX" })).toEqual({});
        expect(applyReceiptCarry(null)).toEqual({});
        expect(
            applyReminderCarry({ client: "Rosa", tone: "final", amount: 5 }),
        ).toEqual({ client: "Rosa" });
        expect(applyReminderCarry("nope")).toEqual({});
    });
});

describe("the PDF", () => {
    it("draws the document's words, with no watermark", () => {
        const v = documentView("invoice", draft(), from);
        const out = drawPdf(jsPDF, v).output();
        expect(out).toContain("INV-0007");
        expect(out).toContain("Northwind Supply Ltd");
        expect(out).toContain("2,736.00");
        expect(out).not.toMatch(/saroh/i);
    });

    it("runs on to another page, in every style", () => {
        const items = Array.from({ length: 90 }, (_, i) => ({
            id: String(i),
            description: `Item ${i} with a long enough description to wrap around the column once or even twice`,
            qty: "1",
            rate: "10",
        }));
        for (const style of ["plain", "bold", "compact"] as const) {
            const doc = drawPdf(
                jsPDF,
                documentView("invoice", draft({ items, style }), from),
            );
            expect(doc.getNumberOfPages()).toBeGreaterThan(1);
        }
    });

    it("draws a receipt", () => {
        const v = receiptView(
            {
                number: "RCT-0019",
                receivedFrom: "Ava Thompson",
                amount: "240",
                currency: "AUD",
                paidOn: "2026-12-03",
                paidBy: "Bank transfer",
                paidFor: "INV-0031",
                showTax: true,
                taxName: "GST",
                taxRate: "10",
            },
            from,
        );
        expect(v.totals[0].value).toBe("A$240.00");
        expect(v.totals[1]).toEqual({
            label: "Includes GST 10%",
            value: "A$21.82",
        });
        expect(drawPdf(jsPDF, v).output()).toContain("PAID");
    });

    it("says when the font can't draw a name", () => {
        expect(canDrawPdf(documentView("invoice", draft(), from))).toBe(true);
        const v = documentView("invoice", draft({ clientName: "सारोह" }), from);
        expect(canDrawPdf(v)).toBe(false);
        const euro = documentView(
            "invoice",
            draft({ clientName: "Søren €" }),
            from,
        );
        expect(canDrawPdf(euro)).toBe(true);
    });
});
