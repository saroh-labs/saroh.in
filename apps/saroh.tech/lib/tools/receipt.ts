import { formatDate } from "./dates";
import type { DocumentView, FromDetails } from "./document";
import { fromLines } from "./document";
import type { Currency } from "./money";
import { CURRENCIES, formatMoney, parseNumber, toCents } from "./money";

export const PAID_BY = ["Card", "Bank transfer", "Cash", "PayPal", "Other"];

export interface ReceiptDraft {
    number: string;
    receivedFrom: string;
    amount: string;
    currency: Currency;
    paidOn: string;
    paidBy: string;
    paidFor: string;
    showTax: boolean;
    taxName: string;
    taxRate: string;
}

/** What a template page hands over: only known fields, as text. */
export function applyReceiptCarry(carry: unknown): Partial<ReceiptDraft> {
    if (!carry || typeof carry !== "object") return {};
    const c = carry as Record<string, unknown>;
    const patch: Partial<ReceiptDraft> = {};
    for (const key of [
        "number",
        "receivedFrom",
        "amount",
        "paidFor",
        "paidBy",
    ] as const) {
        const value = c[key];
        if (typeof value === "string") patch[key] = value;
    }
    if (typeof c.currency === "string" && c.currency in CURRENCIES) {
        patch.currency = c.currency as Currency;
    }
    return patch;
}

/** The tax inside an amount that already includes it. */
export function taxIncluded(amountCents: number, rate: number): number {
    return amountCents - Math.round(amountCents / (1 + rate / 100));
}

export function receiptView(d: ReceiptDraft, from: FromDetails): DocumentView {
    const amount = toCents(parseNumber(d.amount));
    const rate = parseNumber(d.taxRate);
    return {
        heading: "Receipt",
        number: d.number,
        stamp: "PAID",
        style: "plain",
        logo: from.logo,
        parties: [
            { label: "From", lines: fromLines(from) },
            { label: "To", lines: d.receivedFrom ? [d.receivedFrom] : [] },
        ],
        facts: [
            { label: "For", value: d.paidFor },
            { label: "Paid on", value: formatDate(d.paidOn) },
            { label: "Paid by", value: d.paidBy },
        ].filter((f) => f.value.trim() !== ""),
        rows: [],
        extras: [],
        totals: [
            {
                label: "Amount received",
                value: formatMoney(amount, d.currency),
                strong: true,
            },
            ...(d.showTax
                ? [
                      {
                          label: `Includes ${d.taxName || "tax"} ${rate}%`,
                          value: formatMoney(
                              taxIncluded(amount, rate),
                              d.currency,
                          ),
                      },
                  ]
                : []),
        ],
        blocks: [{ label: "", lines: ["Thank you."] }],
        signLine: false,
        fileName: `${(d.number || "receipt").replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`,
    };
}
