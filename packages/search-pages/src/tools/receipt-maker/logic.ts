import type { LineInput } from "../_documents/logic";
import {
    docDate,
    emptyLine,
    fromLine,
    lineLabel,
    money,
    readLines,
    readPaise,
    short,
    showDate,
} from "../_documents/logic";
import type { PaperProps } from "../_documents/parts";

/**
 * The receipt maker's receipt (boards ReceiptMaker*.dc.html): what was
 * paid for, how, and how much came in; when it's less than the total, what
 * is still due. No GST is worked out: a receipt records a payment.
 */

export const PAID_BY = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank transfer" },
] as const;

export type PaidBy = (typeof PAID_BY)[number]["value"];

/** The reference field for each way of paying; cash has none. */
export const REFERENCE: Record<
    Exclude<PaidBy, "cash">,
    { label: string; hint: string }
> = {
    upi: {
        label: "UPI reference",
        hint: "The 12-digit number in their UPI app.",
    },
    card: {
        label: "Card reference",
        hint: "The approval code on the card slip.",
    },
    bank: {
        label: "Transfer reference",
        hint: "The UTR number on the transfer.",
    },
};

export interface ReceiptForm {
    name: string;
    address: string;
    gstin: string;
    customer: string;
    mobile: string;
    number: string;
    date: string;
    paidBy: PaidBy;
    reference: string;
    /** Empty: the whole total. */
    amount: string;
    lines: LineInput[];
}

export const START: ReceiptForm = {
    name: "",
    address: "",
    gstin: "",
    customer: "",
    mobile: "",
    number: "",
    date: "",
    paidBy: "upi",
    reference: "",
    amount: "",
    lines: [emptyLine("0")],
};

export const NUMBER_PLACEHOLDER = "RCT-0001";

/** Why the amount received can't be used, or null. */
export function amountProblem(amount: string, total: number): string | null {
    if (!amount.trim()) return null;
    const p = readPaise(amount);
    if (p === null) return WORDS.amountBad;
    if (p > total) return WORDS.amountOver(total);
    return null;
}

export function receipt(
    f: ReceiptForm,
    /** The amount to show when the typed one can't be used (the last good one). */
    held: number | null = null,
): { paper: PaperProps; received: number; due: number; paidBy: string } {
    const lines = readLines(f.lines);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const typed = f.amount.trim()
        ? amountProblem(f.amount, total)
            ? Math.min(held ?? total, total)
            : (readPaise(f.amount) ?? total)
        : total;
    const label = PAID_BY.find((p) => p.value === f.paidBy)?.label ?? "";
    const ref = f.paidBy !== "cash" ? f.reference.trim() : "";
    const paidBy = ref ? `${label} · ref ${ref}` : label;
    const due = total - typed;
    return {
        received: typed,
        due,
        paidBy,
        paper: {
            title: "Receipt",
            sub: fromLine(f),
            num: f.number.trim() || NUMBER_PLACEHOLDER,
            billed: `Received from ${f.customer.trim() || "your customer"} · ${showDate(docDate(f.date))}`,
            items: lines.map((l) => ({ k: lineLabel(l), v: money(l.amount) })),
            sums: [
                ...(due > 0 ? [{ k: "Total", v: money(total) }] : []),
                { k: "Paid by", v: paidBy },
            ],
            total: { k: "Amount received", v: money(typed) },
        },
    };
}

/** A wa.me link with the receipt in a message, to their mobile when it's given. */
export function shareLink(f: ReceiptForm, received: number): string {
    const digits = f.mobile.replace(/\D/g, "");
    const to =
        digits.length === 10
            ? `91${digits}`
            : digits.length === 12 && digits.startsWith("91")
              ? digits
              : "";
    const label = PAID_BY.find((p) => p.value === f.paidBy)?.label ?? "";
    const text = `Receipt ${f.number.trim() || NUMBER_PLACEHOLDER} from ${f.name.trim() || "us"}: ${money(received)} received on ${showDate(docDate(f.date))}, by ${label}. Thank you.`;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export const WORDS = {
    form: "Your receipt details",
    aside: "Your receipt",
    you: "You",
    from: "Received from",
    name: "Name",
    mobile: "Mobile (optional)",
    mobilePlaceholder: "To share it on WhatsApp",
    gstin: "GSTIN (optional)",
    payment: "Payment",
    number: "Receipt number",
    numberHint: "Keep one series, like RCT-0001, RCT-0002.",
    date: "Date",
    paidBy: "Paid by",
    amount: "Amount received",
    amountHint: "Less than the total? The receipt shows what's still due.",
    amountBad: "Type the amount in rupees, like 3000 or 3000.50.",
    amountOver: (total: number) =>
        `That's more than the total of ${short(total)}. Add a line for the rest, or fix the amount.`,
    held: (paise: number) =>
        `Still showing ${short(paise)} received. Fix the amount to update it.`,
    lines: "For",
    empty: "Your receipt shows here as you type.",
    thanks: "Received with thanks.",
    due: "Still due",
    under: "A receipt shows you were paid. If you're GST-registered, the sale still needs its tax invoice.",
    share: "Share on WhatsApp",
} as const;
