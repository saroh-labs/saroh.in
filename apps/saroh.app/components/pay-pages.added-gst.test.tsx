import { describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import type { PayInvoice } from "@/lib/invoice-pay-shape";
import { isPayInvoice, payLineEachWords } from "@/lib/invoice-pay-shape";
import type { PayOrder } from "@/lib/order-pay-shape";
import { isPayOrder } from "@/lib/order-pay-shape";

import { InvoicePay } from "./invoice-pay";
import { OrderPay } from "./order-pay";

// The first test draws a whole page.
vi.setConfig({ testTimeout: 20_000 });

/**
 * The pay pages (and the receipt, which is the invoice's page) under each
 * way a business carries GST (the owner's rule, 12 Oct 2026: "If the
 * business says prices include GST, ₹1,000 will be the full amount. If they
 * say exclude, then ₹1,000 + GST").
 *
 * The lines are the ones the API serves for ₹1,000, 3 × ₹780 and 7 × ₹99.99
 * at 18% (its `invoices/added-line.spec.ts` and
 * `payments/public-invoices.service.spec.ts` pin these figures). The page
 * only writes them out: a line GST was added to arrives with the price
 * before GST as its rate and the line before GST as its amount.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/pay/[token]/actions", () => ({
    startPayment: vi.fn(),
    startAutopay: vi.fn(),
}));
vi.mock("@/app/pay/o/[token]/actions", () => ({ startPayment: vi.fn() }));

const added = (listCents: number, gstCents: number) => ({
    mode: "ADDED" as const,
    rate: "18",
    listCents,
    gstCents,
    payCents: listCents + gstCents,
});
const inside = (payCents: number, gstCents: number) => ({
    mode: "INCLUDED" as const,
    rate: "18",
    listCents: payCents,
    gstCents,
    payCents,
});

/** A line as the API serves it, less its name. */
interface Line {
    quantity: number;
    unitPrice: string;
    amount: string;
    unitPay: string | null;
    gst: ReturnType<typeof added> | ReturnType<typeof inside>;
}

// Sold with GST added: ₹1,180, 3 × ₹920.40 and 7 × ₹117.99 to pay.
const ADDED_LINES: Line[] = [
    {
        quantity: 1,
        unitPrice: "1000.00",
        amount: "1000.00",
        unitPay: null,
        gst: added(100_000, 18_000),
    },
    {
        quantity: 3,
        unitPrice: "780.00",
        amount: "2340.00",
        unitPay: null,
        gst: added(234_000, 42_120),
    },
    {
        // 7 × ₹99.99 is ₹699.93; the frozen taxable value is ₹699.94.
        quantity: 7,
        unitPrice: "99.99",
        amount: "699.94",
        unitPay: "117.99",
        gst: added(69_994, 12_599),
    },
];
// The same typed prices, sold with GST inside them.
const INCLUDED_LINES: Line[] = [
    {
        quantity: 1,
        unitPrice: "1000.00",
        amount: "1000.00",
        unitPay: null,
        gst: inside(100_000, 15_254),
    },
    {
        quantity: 3,
        unitPrice: "780.00",
        amount: "2340.00",
        unitPay: null,
        gst: inside(234_000, 35_695),
    },
    {
        quantity: 7,
        unitPrice: "99.99",
        amount: "699.93",
        unitPay: null,
        gst: inside(69_993, 10_677),
    },
];
const NAMES = ["Face serum", "Soap", "Lip balm"];

const invoiceOf = (lines: Line[], tax: string, total: string): PayInvoice => ({
    businessName: "Rye & Co.",
    number: "RC/26-27/0042",
    issuedAt: "2026-10-12T00:00:00.000Z",
    dueAt: null,
    lines: lines.map((l, i) => ({ description: NAMES[i] ?? "Item", ...l })),
    tax,
    total,
    currency: "INR",
    status: "ISSUED",
    billedTo: "Meera Iyer",
    theme: null,
});

const orderOf = (lines: Line[], total: string): PayOrder => ({
    businessName: "Rye & Co.",
    orderNumber: "ORD-42",
    firstName: "Meera",
    lines: lines.map((l, i) => ({ name: NAMES[i] ?? "Item", ...l })),
    total,
    due: total,
    currency: "INR",
    status: "DUE",
    theme: null,
});

/** Each row of the page's table as its cells' text: body rows, then foot. */
function rows(html: string): string[][] {
    return Array.from(html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g), (row) =>
        Array.from(row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g), (cell) =>
            cell[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim(),
        ),
    );
}

const paise = (money: string) =>
    Math.round(Number(money.replace(/[₹,]/g, "")) * 100);

describe("an invoice's pay page, GST added to its prices", () => {
    const invoice = invoiceOf(ADDED_LINES, "727.19", "4767.13");
    const table = () =>
        rows(
            renderToStaticMarkup(<InvoicePay token="tok" invoice={invoice} />),
        );

    it("is a shape the page reads", () => {
        expect(isPayInvoice(invoice)).toBe(true);
    });

    it("prints the typed price as the rate, the line before GST as the amount, the GST beside it", () => {
        expect(table()).toEqual([
            ["Item", "Qty", "Amount"],
            ["Face serum ₹1,000 + ₹180 GST (18%)", "1", "₹1,000.00"],
            ["Soap ₹780.00 each ₹2,340 + ₹421.20 GST (18%)", "3", "₹2,340.00"],
            [
                "Lip balm ₹99.99 each, ₹117.99 with GST ₹699.94 + ₹125.99 GST (18%)",
                "7",
                "₹699.94",
            ],
            ["Tax", "₹727.19"],
            ["Total", "₹4,767.13"],
        ]);
    });

    it("adds up down the page: ₹1,000 + ₹2,340 + ₹699.94, + ₹727.19 tax, is ₹4,767.13", () => {
        const t = table();
        const amounts = t.slice(1, 4).map((r) => paise(r[2] ?? ""));
        expect(amounts).toEqual([100_000, 234_000, 69_994]);
        const tax = paise(t[4]?.[1] ?? "");
        const total = paise(t[5]?.[1] ?? "");
        expect(amounts.reduce((s, x) => s + x, 0) + tax).toBe(total);
        expect(total).toBe(476_713);
    });
});

describe("an invoice's pay page, prices that include GST", () => {
    const invoice = invoiceOf(INCLUDED_LINES, "616.26", "4039.93");

    it("prints the amounts to pay, as it always has", () => {
        expect(
            rows(
                renderToStaticMarkup(
                    <InvoicePay token="tok" invoice={invoice} />,
                ),
            ),
        ).toEqual([
            ["Item", "Qty", "Amount"],
            ["Face serum includes ₹152.54 GST (18%)", "1", "₹1,000.00"],
            ["Soap ₹780.00 each includes ₹356.95 GST (18%)", "3", "₹2,340.00"],
            ["Lip balm ₹99.99 each includes ₹106.77 GST (18%)", "7", "₹699.93"],
            ["Tax", "₹616.26"],
            ["Total", "₹4,039.93"],
        ]);
    });

    it("is the same markup from an API that sends no unitPay at all", () => {
        const older: PayInvoice = {
            ...invoice,
            lines: invoice.lines.map(({ unitPay: _none, ...l }) => l),
        };
        expect(
            renderToStaticMarkup(<InvoicePay token="tok" invoice={older} />),
        ).toBe(
            renderToStaticMarkup(<InvoicePay token="tok" invoice={invoice} />),
        );
    });
});

describe("an invoice's pay page with both kinds of line", () => {
    it("each line says its own: ₹1,000 + ₹180, and ₹1,000 with ₹152.54 inside, ₹2,180 in all", () => {
        const first = ADDED_LINES[0];
        const second = INCLUDED_LINES[0];
        const t = rows(
            renderToStaticMarkup(
                <InvoicePay
                    token="tok"
                    invoice={invoiceOf([first, second], "332.54", "2180.00")}
                />,
            ),
        );
        expect(t.slice(1, 3)).toEqual([
            ["Face serum ₹1,000 + ₹180 GST (18%)", "1", "₹1,000.00"],
            ["Soap includes ₹152.54 GST (18%)", "1", "₹1,000.00"],
        ]);
        expect(t[4]).toEqual(["Total", "₹2,180.00"]);
        // What each line comes to with its GST is the total: 1,180 + 1,000.
        expect(first.gst.payCents + second.gst.payCents).toBe(218_000);
    });
});

describe("an order's pay page", () => {
    it("GST added: the typed price as the rate, the line before GST as the amount", () => {
        const order = orderOf(ADDED_LINES, "4767.13");
        expect(isPayOrder(order)).toBe(true);
        const t = rows(
            renderToStaticMarkup(<OrderPay token="tok" order={order} />),
        );
        expect(t).toEqual([
            ["Item", "Qty", "Amount"],
            ["Face serum ₹1,000 + ₹180 GST (18%)", "1", "₹1,000.00"],
            ["Soap ₹780.00 each ₹2,340 + ₹421.20 GST (18%)", "3", "₹2,340.00"],
            [
                "Lip balm ₹99.99 each, ₹117.99 with GST ₹699.94 + ₹125.99 GST (18%)",
                "7",
                "₹699.94",
            ],
            ["Total", "₹4,767.13"],
        ]);
        // Each line before GST and its GST: ₹1,180 + ₹2,761.20 + ₹825.93.
        expect(ADDED_LINES.reduce((s, l) => s + l.gst.payCents, 0)).toBe(
            476_713,
        );
    });

    it("includes GST: the amounts to pay, as it always has", () => {
        const t = rows(
            renderToStaticMarkup(
                <OrderPay
                    token="tok"
                    order={orderOf(INCLUDED_LINES, "4039.93")}
                />,
            ),
        );
        expect(t).toEqual([
            ["Item", "Qty", "Amount"],
            ["Face serum includes ₹152.54 GST (18%)", "1", "₹1,000.00"],
            ["Soap ₹780.00 each includes ₹356.95 GST (18%)", "3", "₹2,340.00"],
            ["Lip balm ₹99.99 each includes ₹106.77 GST (18%)", "7", "₹699.93"],
            ["Total", "₹4,039.93"],
        ]);
    });
});

describe("payLineEachWords", () => {
    it("says each only for more than one, and one with its GST only where the API sent it", () => {
        expect(
            payLineEachWords({ quantity: 1, unitPrice: "1000.00" }, "INR"),
        ).toBeNull();
        expect(
            payLineEachWords({ quantity: 3, unitPrice: "780.00" }, "INR"),
        ).toBe("₹780.00 each");
        expect(
            payLineEachWords(
                { quantity: 3, unitPrice: "780.00", unitPay: null },
                "INR",
            ),
        ).toBe("₹780.00 each");
        expect(
            payLineEachWords(
                { quantity: 7, unitPrice: "99.99", unitPay: "117.99" },
                "INR",
            ),
        ).toBe("₹99.99 each, ₹117.99 with GST");
        // Anything strange is none said.
        expect(
            payLineEachWords(
                { quantity: 7, unitPrice: "99.99", unitPay: 11799 },
                "INR",
            ),
        ).toBe("₹99.99 each");
    });
});
