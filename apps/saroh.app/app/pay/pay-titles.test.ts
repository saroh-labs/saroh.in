import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata as invoiceMetadata } from "./[token]/page";
import { generateMetadata as orderMetadata } from "./o/[token]/page";

/**
 * The pay link pages' tab title: "Pay ‹business›", so the tab says who is
 * being paid. A link that doesn't open keeps the plain title. Both stay
 * unindexed and send no referrer: the link is a credential.
 */

const read = vi.hoisted(() => {
    const state: { invoice: unknown; order: unknown } = {
        invoice: null,
        order: null,
    };
    return state;
});

vi.mock("@/lib/invoice-pay", () => ({
    getPayInvoice: vi.fn(() => Promise.resolve(read.invoice)),
}));
vi.mock("@/lib/order-pay", () => ({
    getPayOrder: vi.fn(() => Promise.resolve(read.order)),
}));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "https://api.test" }));
vi.mock("@/lib/invoice-pdf", () => ({ payPdfHref: () => "/pdf" }));
vi.mock("@/lib/pay-host", () => ({
    payRedirect: () => null,
    TENANT_HOST_HEADER: "x-tenant-host",
}));
vi.mock("@/lib/site-fonts", () => ({ SITE_FACES: {} }));
vi.mock("@/components/invoice-pay", () => ({ InvoicePay: () => null }));
vi.mock("@/components/order-pay", () => ({ OrderPay: () => null }));
vi.mock("@saroh/site-blocks", () => ({ SiteTheme: () => null }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const params = Promise.resolve({ token: "tok" });

describe("the pay link's tab title", () => {
    beforeEach(() => {
        read.invoice = { ok: true, invoice: { businessName: "Rye & Co." } };
        read.order = { ok: true, order: { businessName: "Rye & Co." } };
    });

    it("names the business on an invoice's link", async () => {
        const metadata = await invoiceMetadata({ params });
        expect(metadata.title).toBe("Pay Rye & Co.");
        expect(metadata.robots).toEqual({ index: false, follow: false });
        expect(metadata.referrer).toBe("no-referrer");
    });

    it("names the business on an order's link", async () => {
        const metadata = await orderMetadata({ params });
        expect(metadata.title).toBe("Pay Rye & Co.");
        expect(metadata.robots).toEqual({ index: false, follow: false });
        expect(metadata.referrer).toBe("no-referrer");
    });

    it("keeps the plain title, still unindexed, when the link doesn't open", async () => {
        read.invoice = { ok: false, reason: "missing" };
        read.order = { ok: false, reason: "unavailable" };
        const invoice = await invoiceMetadata({ params });
        const order = await orderMetadata({ params });
        expect(invoice.title).toBe("Pay your invoice");
        expect(order.title).toBe("Pay for your order");
        for (const metadata of [invoice, order]) {
            expect(metadata.robots).toEqual({ index: false, follow: false });
            expect(metadata.referrer).toBe("no-referrer");
        }
    });
});
