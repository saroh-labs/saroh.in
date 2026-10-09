import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DetailInvoice } from "@/lib/customer-workspace/detail";
import { isPayable } from "@/lib/customer-workspace/view";

import { InvoicesTab } from "./billing-tabs";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/invoices/actions", () => ({
    creditInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    issueInvoice: vi.fn(),
    recordPayment: vi.fn(),
    reissueInvoice: vi.fn(),
    voidInvoice: vi.fn(),
}));

/**
 * The person page's Invoices tab (#869): "Record payment" on each invoice
 * still owed, for whoever may write invoices — Invoice Detail's own dialog —
 * and on nothing else.
 */

const NOW = new Date("2026-10-09T10:00:00Z");

const invoice = (over: Partial<DetailInvoice>): DetailInvoice => ({
    id: "i1",
    number: "RC/26-27/0117",
    status: "ISSUED",
    standing: "ISSUED",
    source: "MANUAL",
    kind: "INVOICE",
    orderId: null,
    orderNumber: null,
    planName: null,
    total: "1200.00",
    currency: "INR",
    issuedAt: "2026-10-01T07:14:00Z",
    dueAt: "2026-10-08T07:14:00Z",
    paidAt: null,
    ...over,
});

const ROWS = [
    invoice({ id: "due", number: "INV-1" }),
    invoice({ id: "late", number: "INV-2", standing: "OVERDUE" }),
    invoice({ id: "paid", number: "INV-3", standing: "PAID", status: "PAID" }),
    invoice({ id: "draft", number: null, standing: "DRAFT", status: "DRAFT" }),
    invoice({ id: "credit", number: "CN-1", kind: "CREDIT_NOTE" }),
];

function render(payer: string | null) {
    return renderToStaticMarkup(
        <InvoicesTab
            rows={ROWS}
            owed={null}
            kind="commerce"
            timeZone="Asia/Kolkata"
            now={NOW}
            payer={payer}
        />,
    );
}

const buttons = (html: string) => html.match(/Record payment/g)?.length ?? 0;

describe("isPayable", () => {
    it("is an issued or overdue invoice, never a credit note", () => {
        expect(isPayable({ kind: "INVOICE", standing: "ISSUED" })).toBe(true);
        expect(isPayable({ kind: "INVOICE", standing: "OVERDUE" })).toBe(true);
        expect(isPayable({ kind: "INVOICE", standing: "PAID" })).toBe(false);
        expect(isPayable({ kind: "INVOICE", standing: "DRAFT" })).toBe(false);
        expect(isPayable({ kind: "INVOICE", standing: "VOID" })).toBe(false);
        expect(isPayable({ kind: "CREDIT_NOTE", standing: "ISSUED" })).toBe(
            false,
        );
    });
});

describe("InvoicesTab — Record payment (#869)", () => {
    it("offers it on each unpaid invoice to whoever may write invoices", () => {
        const html = render("Asha Rao");
        expect(buttons(html)).toBe(2);
        // Every row still opens its invoice.
        for (const id of ["due", "late", "paid", "draft", "credit"])
            expect(html).toContain(`href="/billing/invoices/${id}"`);
    });

    it("never nests the button inside the row's link", () => {
        const html = render("Asha Rao");
        expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<button/);
        // …and the check would catch one.
        expect("<a href=x><span>1</span><button>").toMatch(
            /<a [^>]*>(?:(?!<\/a>)[\s\S])*<button/,
        );
    });

    it("offers nothing to a viewer who may not (DEC-098)", () => {
        expect(buttons(render(null))).toBe(0);
    });
});
