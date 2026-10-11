import { describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import type { PayInvoice } from "@/lib/invoice-pay-shape";
import type { PayOrder } from "@/lib/order-pay-shape";

import { InvoicePay } from "./invoice-pay";
import { OrderPay } from "./order-pay";

/**
 * The two pay link pages as a customer first sees them, as markup: the
 * business's name is the heading, Pay is the one thing to press, and
 * nothing of the provider's handoff is drawn. What happens once Pay is
 * pressed (the window, paying, failed, closed, still checking) is
 * `PayLinkPay`'s, tested in `@saroh/site-blocks` with the window replaced.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/pay/[token]/actions", () => ({
    startPayment: vi.fn(),
    startAutopay: vi.fn(),
}));
vi.mock("@/app/pay/o/[token]/actions", () => ({ startPayment: vi.fn() }));

const INVOICE: PayInvoice = {
    businessName: "Rye & Co.",
    number: "INV-7",
    issuedAt: "2026-10-01T00:00:00.000Z",
    dueAt: "2026-10-15T00:00:00.000Z",
    lines: [
        {
            description: "Sourdough class",
            quantity: 1,
            unitPrice: "1400.00",
            amount: "1400.00",
        },
    ],
    tax: "0.00",
    total: "1400.00",
    currency: "INR",
    status: "ISSUED",
    billedTo: "Asha Rao",
    theme: null,
};

const ORDER: PayOrder = {
    businessName: "Rye & Co.",
    orderNumber: "ORD-7",
    firstName: "Asha",
    lines: [
        {
            name: "Sourdough",
            quantity: 2,
            unitPrice: "250.00",
            amount: "500.00",
        },
    ],
    total: "500.00",
    due: "500.00",
    currency: "INR",
    status: "DUE",
    theme: null,
};

/**
 * A developer's placeholder, a provider's name or id, raw JSON, or a status
 * as the database spells it ("Issued" as a date's label is fine).
 */
const NOT_FOR_CUSTOMERS =
    /[Ww]idget|mounts here|[Hh]andoff|clientParams|[Pp]rovider|[Pp]ublic key|RAZORPAY|CASHFREE|Razorpay|Cashfree|\{&quot;|ISSUED|OVERDUE|\bDUE\b|[Ww]ebhook/;

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        // Last, so "&amp;#x27;" stays "&#x27;" and is never read twice.
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");

describe("an invoice's pay link", () => {
    it("heads the page with the business's name and offers Pay, with nothing to check yet", () => {
        const html = renderToStaticMarkup(
            <InvoicePay token="tok" invoice={INVOICE} />,
        );
        expect(html).toMatch(/<h1 [^>]*>Rye &amp; Co\.<\/h1>/);
        expect(html).toMatch(/<h2 [^>]*>Invoice INV-7<\/h2>/);
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).toMatch(/<button [^>]*>Pay ₹1,400\.00<\/button>/);
        expect(html).not.toContain("Check again");
        expect(html).not.toMatch(NOT_FOR_CUSTOMERS);
        expect(html).not.toContain("—");
    });

    it("puts the business's phone and email under Pay when the page has them", () => {
        const html = renderToStaticMarkup(
            <InvoicePay
                token="tok"
                invoice={{
                    ...INVOICE,
                    businessContact: {
                        phone: "+919845012345",
                        email: "hello@rye.example",
                    },
                }}
            />,
        );
        expect(text(html)).toContain("Need help? Reach Rye & Co. on");
        expect(html).toContain('href="tel:+919845012345"');
        expect(html).toContain('href="mailto:hello@rye.example"');
        expect(html.indexOf("Need help?")).toBeGreaterThan(
            html.indexOf("Pay ₹1,400.00"),
        );
    });

    it("says nothing about reaching the business when the page has no contact", () => {
        const html = renderToStaticMarkup(
            <InvoicePay token="tok" invoice={INVOICE} />,
        );
        expect(html).not.toContain("Need help?");
    });

    it("says paid, with nothing to press, only when the server's read says so", () => {
        const html = renderToStaticMarkup(
            <InvoicePay token="tok" invoice={{ ...INVOICE, status: "PAID" }} />,
        );
        expect(text(html)).toContain(
            "This invoice is paid. Thank you, there's nothing more to do.",
        );
        expect(html).not.toMatch(/<button [^>]*>Pay /);
        expect(html).not.toContain("Check again");
        expect(html).not.toContain("—");
    });

    it("offers no Pay where the business doesn't take payment online", () => {
        const html = renderToStaticMarkup(
            <InvoicePay
                token="tok"
                invoice={{ ...INVOICE, payOnline: false }}
            />,
        );
        expect(html).not.toMatch(/<button [^>]*>Pay /);
        expect(html).toMatch(/<h1 [^>]*>Rye &amp; Co\.<\/h1>/);
    });
});

describe("an order's pay link", () => {
    it("heads the page with the business's name and offers Pay, with nothing to check yet", () => {
        const html = renderToStaticMarkup(
            <OrderPay token="tok" order={ORDER} />,
        );
        expect(html).toMatch(/<h1 [^>]*>Rye &amp; Co\.<\/h1>/);
        expect(html).toMatch(/<h2 [^>]*>Order #ORD-7<\/h2>/);
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).toMatch(/<button [^>]*>Pay ₹500\.00<\/button>/);
        // Hidden until a payment has been started.
        expect(html).not.toContain("Check again");
        expect(html).not.toMatch(NOT_FOR_CUSTOMERS);
        expect(html).not.toContain("—");
    });

    it("charges what is left on a part-paid order", () => {
        const html = renderToStaticMarkup(
            <OrderPay token="tok" order={{ ...ORDER, due: "200.00" }} />,
        );
        expect(html).toMatch(/<button [^>]*>Pay ₹200\.00<\/button>/);
        expect(text(html)).toContain("Left to pay");
    });

    it("says paid, with nothing to press, only when the server's read says so", () => {
        const html = renderToStaticMarkup(
            <OrderPay token="tok" order={{ ...ORDER, status: "PAID" }} />,
        );
        expect(text(html)).toContain(
            "Already paid. Thank you, there's nothing more to do.",
        );
        expect(html).not.toMatch(/<button/);
        expect(html).not.toContain("—");
    });

    it("is view-only where the business can't take it online", () => {
        const html = renderToStaticMarkup(
            <OrderPay token="tok" order={{ ...ORDER, payOnline: false }} />,
        );
        expect(html).not.toMatch(/<button/);
        expect(text(html)).toContain("Pay Rye & Co. directly");
    });
});
