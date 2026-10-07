import { invoiceStanding } from "../invoices/invoice-state";
import type { InvoiceTitle } from "../invoices/invoice-title";
import { invoiceTitle, isExemptSupply } from "../invoices/invoice-title";

/*
 * What Order Detail's money card calls the order's paper (D15, with B14):
 * named here, by the rule the invoice read uses (`invoice-title.ts`), so
 * a registered clinic's exempt treatment says "Bill of supply" rather than
 * the card guessing "Tax invoice" from a number.
 */

interface DecimalLike {
    toString(): string;
}

/** An order's paper as the read loads it: enough to name it. */
export interface RawOrderInvoice {
    id: string;
    number: string | null;
    kind: string;
    status: string;
    /** How it was paid: CASH, UPI… by hand, ONLINE, ORDER or RECORDED. */
    paymentMethod?: string | null;
    /** Frozen on issue: set means the business was registered then. */
    sellerGstin?: string | null;
    dueAt?: Date | null;
    lines?: { gstRate?: DecimalLike | null }[];
}

/** What the read loads of each paper to name it. */
export const INVOICE_TITLE_SELECT = {
    sellerGstin: true,
    dueAt: true,
    lines: { select: { gstRate: true } },
} as const;

/** What an order's paper is called, from what was frozen on it. */
export function orderInvoiceTitle(
    paper: RawOrderInvoice,
    now: Date,
): InvoiceTitle {
    const frozen = {
        kind: paper.kind,
        sellerGstin: paper.sellerGstin ?? null,
    };
    return invoiceTitle(
        {
            ...frozen,
            standing: invoiceStanding(
                { status: paper.status, dueAt: paper.dueAt ?? null },
                now,
            ),
        },
        isExemptSupply({ ...frozen, lines: paper.lines ?? [] }),
    );
}
