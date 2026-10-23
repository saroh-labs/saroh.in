import { describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import type { PayPayment } from "@/lib/invoice-paid-shape";
import { paidStanding, payPaymentsOf } from "@/lib/invoice-paid-shape";
import type { PayInvoice } from "@/lib/invoice-pay-shape";

import { InvoicePay } from "./invoice-pay";
import { PayLinkGone } from "./pay-link-gone";

/**
 * The customer's pay page after money came in (DEC-173, U16 #1128;
 * INVRecordPlus "What Vivek sees" and "The receipt for a cheque"): each
 * state the page can be in, as markup. It says only what the API's read
 * says: nothing paid, part paid, paid, a cheque not in the bank yet, a
 * cheque the bank returned, and a link that no longer opens.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/pay/[token]/actions", () => ({
    startPayment: vi.fn(),
    startAutopay: vi.fn(),
}));

const VIVEK: PayInvoice = {
    businessName: "Rye & Co.",
    number: "RC/26-27/0106",
    issuedAt: "2026-09-30T00:00:00.000Z",
    dueAt: "2026-10-07T00:00:00.000Z",
    lines: [
        {
            description: "Catering, 40 guests",
            quantity: 1,
            unitPrice: "8400.00",
            amount: "8400.00",
        },
    ],
    tax: "0.00",
    total: "8400.00",
    paidSoFar: "0.00",
    leftToPay: "8400.00",
    payments: [],
    currency: "INR",
    status: "ISSUED",
    billedTo: "Vivek Nair",
    theme: null,
};

const CASH_4000: PayPayment = {
    amount: "4000.00",
    method: "CASH",
    receivedAt: "2026-10-19T06:00:00.000Z",
    cheque: null,
};

const CHEQUE_8400 = (
    status: "WAITING" | "CLEARED" | "BOUNCED",
): PayPayment => ({
    amount: "8400.00",
    method: "CHEQUE",
    receivedAt: "2026-10-19T06:00:00.000Z",
    cheque: { number: "004512", bank: "HDFC Bank", status },
});

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");

const render = (invoice: PayInvoice) =>
    renderToStaticMarkup(<InvoicePay token="tok" invoice={invoice} />);

const payButton = /<button [^>]*>Pay ₹/;

describe("the pay page once money has come in", () => {
    it("nothing paid: the whole amount to pay, and no receipt", () => {
        const html = render(VIVEK);
        expect(html).toMatch(/<button [^>]*>Pay ₹8,400\.00<\/button>/);
        expect(html).not.toContain("data-paid-so-far");
        expect(text(html)).not.toContain("Paid so far");
        expect(text(html)).not.toContain("received");
        expect(text(html)).toContain("Due");
    });

    it("part paid: what was received, how and when, paid so far and left to pay, and Pay for what is left", () => {
        const html = render({
            ...VIVEK,
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
            payments: [CASH_4000],
        });
        const t = text(html);
        expect(t).toContain("₹4,000.00 received");
        expect(t).toContain("Cash · 19 October 2026");
        expect(t).toContain("Total ₹8,400.00");
        expect(t).toContain("Paid so far ₹4,000.00");
        expect(t).toContain("Left to pay ₹4,400.00");
        expect(t).toContain("Partly paid");
        expect(html).toMatch(/<button [^>]*>Pay ₹4,400\.00<\/button>/);
        expect(html).not.toMatch(/Pay ₹8,400/);
        // The receipt comes before the paper's lines.
        expect(html.indexOf("received")).toBeLessThan(html.indexOf("Catering"));
    });

    it("part paid on a business that doesn't take payment online: no Pay, what is left to pay them, and a copy to keep", () => {
        const html = render({
            ...VIVEK,
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
            payments: [CASH_4000],
            payOnline: false,
        });
        const t = text(html);
        expect(html).not.toMatch(payButton);
        expect(t).toContain("Left to pay ₹4,400.00");
        expect(t).toContain("Pay Rye & Co. the way they've asked you to.");
        expect(t).toContain("Print or save as PDF");
    });

    it("part paid, how to pay set: the offline amount is what is left", () => {
        const html = render({
            ...VIVEK,
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
            payments: [CASH_4000],
            payOnline: false,
            payInstructions: {
                upiId: "rye@okhdfc",
                bankAccountName: null,
                bankAccountNumber: null,
                bankIfsc: null,
                bankName: null,
                note: null,
            },
        });
        expect(text(html)).toContain("Pay ₹4,400.00 by UPI");
        expect(text(html)).not.toContain("Pay ₹8,400.00 by");
    });

    it("paid: the last payment as a receipt, the earlier ones under it, and nothing to press", () => {
        const html = render({
            ...VIVEK,
            status: "PAID",
            paidSoFar: "8400.00",
            leftToPay: "0.00",
            payments: [
                CASH_4000,
                {
                    amount: "4400.00",
                    method: "ONLINE",
                    receivedAt: "2026-10-20T06:00:00.000Z",
                    cheque: null,
                },
            ],
        });
        const t = text(html);
        expect(t).toContain("₹4,400.00 received");
        expect(t).toContain("Paid online · 20 October 2026");
        expect(t).toContain("Also received");
        expect(t).toContain("Cash · 19 October 2026 ₹4,000.00");
        expect(t).toContain(
            "This invoice is paid. Thank you, there's nothing more to do.",
        );
        expect(t).not.toContain("Left to pay");
        expect(html).not.toMatch(payButton);
    });

    it("a cheque not in the bank yet: the cheque's own words, never called paid, and no Pay", () => {
        const html = render({
            ...VIVEK,
            status: "PAID",
            paidSoFar: "8400.00",
            leftToPay: "0.00",
            payments: [CHEQUE_8400("WAITING")],
        });
        const t = text(html);
        expect(t).toContain("Cheque for ₹8,400.00 received");
        expect(t).toContain("Cheque 004512 · HDFC Bank · 19 October 2026");
        expect(t).toContain(
            "This invoice is settled once the cheque clears. If it's returned by the bank, the amount is due again.",
        );
        expect(t).toContain("Cheque received");
        expect(t).not.toMatch(/>\s*Paid\s*</);
        expect(t).not.toContain("This invoice is paid");
        expect(html).not.toMatch(payButton);
    });

    it("a cheque for part of it, waiting: it counts once it clears, and Pay for the rest", () => {
        const html = render({
            ...VIVEK,
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
            payments: [{ ...CHEQUE_8400("WAITING"), amount: "4000.00" }],
        });
        const t = text(html);
        expect(t).toContain("Cheque for ₹4,000.00 received");
        expect(t).toContain("This payment counts once the cheque clears.");
        expect(t).not.toContain("This invoice is settled");
        expect(html).toMatch(/<button [^>]*>Pay ₹4,400\.00<\/button>/);
    });

    it("a cheque in the bank: received, in the bank, and paid", () => {
        const t = text(
            render({
                ...VIVEK,
                status: "PAID",
                paidSoFar: "8400.00",
                leftToPay: "0.00",
                payments: [CHEQUE_8400("CLEARED")],
            }),
        );
        expect(t).toContain("₹8,400.00 received");
        expect(t).toContain(
            "Cheque 004512 · HDFC Bank · 19 October 2026 · in the bank",
        );
        expect(t).toContain("This invoice is paid.");
    });

    it("a cheque the bank returned: says so, the amount is due again, and Pay for it", () => {
        const html = render({
            ...VIVEK,
            status: "OVERDUE",
            paidSoFar: "0.00",
            leftToPay: "8400.00",
            payments: [CHEQUE_8400("BOUNCED")],
        });
        const t = text(html);
        expect(t).toContain(
            "Cheque 004512 · HDFC Bank was returned by the bank",
        );
        expect(t).toContain("The ₹8,400.00 it paid is due again.");
        expect(t).not.toContain("Cheque for ₹8,400.00 received");
        expect(t).toContain("Overdue");
        expect(html).toMatch(/<button [^>]*>Pay ₹8,400\.00<\/button>/);
    });

    it("a cheque returned after it was banked says so (#7)", () => {
        const [returned] = payPaymentsOf([
            {
                ...CHEQUE_8400("BOUNCED"),
                cheque: {
                    number: "004512",
                    bank: "HDFC Bank",
                    status: "BOUNCED",
                    returnedAfterBanking: true,
                },
            },
        ]);
        expect(returned.cheque?.returnedAfterBanking).toBe(true);
        const t = text(
            render({
                ...VIVEK,
                status: "OVERDUE",
                paidSoFar: "0.00",
                leftToPay: "8400.00",
                payments: [returned],
            }),
        );
        expect(t).toContain(
            "Cheque 004512 · HDFC Bank was returned by the bank after it was banked",
        );
        expect(t).toContain("The ₹8,400.00 it paid is due again.");
    });

    it("an older API with none of the new fields reads as before", () => {
        const { paidSoFar: _p, leftToPay: _l, payments: _ps, ...older } = VIVEK;
        const html = render(older);
        expect(html).toMatch(/<button [^>]*>Pay ₹8,400\.00<\/button>/);
        expect(html).not.toContain("data-paid-so-far");
    });

    it("never draws Saroh's own colours: only the site's tokens", () => {
        const html = render({
            ...VIVEK,
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
            payments: [CASH_4000, CHEQUE_8400("BOUNCED")],
        });
        const receipt = html.slice(html.indexOf("data-paid-so-far"));
        const block = receipt.slice(0, receipt.indexOf("<table"));
        for (const cls of block.match(/class="[^"]*"/g) ?? []) {
            expect(cls).not.toMatch(
                /\b(?:bg|text|border)-(?:primary|accent|brand|success|warning|destructive|foreground|background|muted)\b/,
            );
        }
    });
});

describe("a pay link that doesn't open", () => {
    it("replaced or cancelled: the same words either way", () => {
        const t = text(renderToStaticMarkup(<PayLinkGone reason="missing" />));
        expect(t).toContain("This link no longer works");
        expect(t).toContain("sent you a newer link");
    });

    it("too many tries, or our own failure, say so", () => {
        expect(
            text(renderToStaticMarkup(<PayLinkGone reason="busy" />)),
        ).toContain("Too many tries at once");
        expect(
            text(renderToStaticMarkup(<PayLinkGone reason="unavailable" />)),
        ).toContain("We couldn't open your invoice");
    });
});

describe("the payments from the API, checked", () => {
    it("keeps what it can say and leaves out what it can't", () => {
        expect(
            payPaymentsOf([
                {
                    amount: "4000.00",
                    method: "CASH",
                    receivedAt: "2026-10-19T06:00:00.000Z",
                    cheque: null,
                },
                // A cheque with no status can't be said truthfully.
                {
                    amount: "100.00",
                    method: "CHEQUE",
                    receivedAt: "2026-10-19T06:00:00.000Z",
                    cheque: null,
                },
                { amount: "1e3", method: "CASH", receivedAt: "x" },
                "junk",
            ]),
        ).toEqual([
            {
                amount: "4000.00",
                method: "CASH",
                receivedAt: "2026-10-19T06:00:00.000Z",
                cheque: null,
            },
        ]);
        expect(payPaymentsOf(undefined)).toEqual([]);
        expect(payPaymentsOf({})).toEqual([]);
    });

    it("says a bounce only while it is the last word and money is owed", () => {
        const bounced = CHEQUE_8400("BOUNCED");
        expect(
            paidStanding({
                status: "ISSUED",
                total: "8400.00",
                payments: [bounced],
            }).bouncedCheque,
        ).toBe(bounced);
        // Paid another way after it: nothing to warn about.
        expect(
            paidStanding({
                status: "PAID",
                total: "8400.00",
                payments: [
                    bounced,
                    { ...CASH_4000, receivedAt: "2026-10-25T00:00:00.000Z" },
                ],
            }).bouncedCheque,
        ).toBeNull();
    });
});
