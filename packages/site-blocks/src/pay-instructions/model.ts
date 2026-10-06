import { encode } from "uqr";

/**
 * "How to pay us" (R32): how a customer pays a business offline — its UPI ID
 * (drawn as a scannable UPI QR), bank details for a transfer, and a short
 * note. The API sends it only inside the customer's own unpaid invoice,
 * order or booking (`organizations/business-pay-instructions.ts`); a page
 * never asks for it by itself.
 */
export interface PayInstructions {
    upiId: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    note: string | null;
}

const FIELDS = [
    "upiId",
    "bankAccountName",
    "bankAccountNumber",
    "bankIfsc",
    "bankName",
    "note",
] as const;

const nonEmpty = (v: string | null | undefined): v is string =>
    typeof v === "string" && v.trim() !== "";

/** The API's answer, checked field by field; null when strange or empty. */
export function payInstructionsOf(v: unknown): PayInstructions | null {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    const out = {} as Record<(typeof FIELDS)[number], string | null>;
    for (const field of FIELDS) {
        const value = o[field];
        if (value !== undefined && value !== null && typeof value !== "string")
            return null;
        out[field] = nonEmpty(value) ? value.trim() : null;
    }
    // Bank details are only any use whole.
    if (!(out.bankAccountNumber && out.bankIfsc && out.bankAccountName)) {
        out.bankAccountName = null;
        out.bankAccountNumber = null;
        out.bankIfsc = null;
        out.bankName = null;
    }
    return hasPayInstructions(out) ? out : null;
}

/** Something to show: a UPI ID, whole bank details or a note. */
export function hasPayInstructions(
    p: PayInstructions | null | undefined,
): p is PayInstructions {
    return (
        !!p &&
        (nonEmpty(p.upiId) ||
            (nonEmpty(p.bankAccountNumber) && nonEmpty(p.bankIfsc)) ||
            nonEmpty(p.note))
    );
}

/**
 * The ways set, in words: "UPI or bank transfer", "UPI", "bank transfer",
 * or null when only a note is.
 */
export function payWaysText(p: PayInstructions | null): string | null {
    if (!p) return null;
    const upi = nonEmpty(p.upiId);
    const bank = nonEmpty(p.bankAccountNumber) && nonEmpty(p.bankIfsc);
    if (upi && bank) return "UPI or bank transfer";
    if (upi) return "UPI";
    if (bank) return "bank transfer";
    return null;
}

/** UPI's "pn" and "tn" are short fields; long ones fail in some apps. */
const MAX_UPI_TEXT = 50;

const shortText = (s: string) =>
    s.replace(/\s+/g, " ").trim().slice(0, MAX_UPI_TEXT).trim();

/**
 * The UPI deep link the QR carries, per NPCI's linking spec:
 * `upi://pay?pa=<id>&pn=<payee>&am=<amount>&cu=INR&tn=<note>`.
 *
 * The amount goes in only when it is a positive amount in rupees, written
 * with two decimals ("1400.00"); otherwise the customer types it in their
 * app. `tn` names what it pays ("Invoice RC-0001"), so the business can
 * tell the payment apart.
 */
export function upiPayUri({
    upiId,
    payee,
    amount,
    currency = "INR",
    note,
}: {
    upiId: string;
    payee: string;
    amount?: string | null;
    currency?: string;
    note?: string | null;
}): string {
    const params: [string, string][] = [
        ["pa", upiId.trim()],
        ["pn", shortText(payee)],
    ];
    const value = amount == null ? NaN : Number(amount);
    if (currency === "INR" && Number.isFinite(value) && value > 0) {
        params.push(["am", value.toFixed(2)]);
    }
    params.push(["cu", "INR"]);
    if (note?.trim()) params.push(["tn", shortText(note)]);
    return `upi://pay?${params
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&")}`;
}

/**
 * The QR's modules as one SVG path, a unit square per dark module, with a
 * quiet zone of `border` modules. Medium error correction: it survives a
 * phone screen's glare and a printed copy.
 */
export function qrPath(
    text: string,
    border = 2,
): { size: number; path: string } {
    const qr = encode(text, { ecc: "M", border });
    const parts: string[] = [];
    qr.data.forEach((row, y) => {
        row.forEach((dark, x) => {
            if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
        });
    });
    return { size: qr.size, path: parts.join("") };
}

/** "1234 5678 9012": an account number in fours, easier to read out. */
export function groupedAccount(number: string): string {
    return number.replace(/(\d{4})(?=\d)/g, "$1 ");
}
