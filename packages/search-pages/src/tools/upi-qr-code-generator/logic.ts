/**
 * The UPI QR code's link (design UpiQr*.dc.html, #1207): the NPCI deep link
 * every UPI app reads, `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`. Values are
 * percent-encoded, except the @ in the UPI ID, which apps expect as typed.
 * Pure, so a test pins it and reads the drawn code back.
 */

/** name@bank: letters, digits, dot, dash or underscore, one @, then the bank's handle. */
export const UPI_ID_SHAPE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/i;

export const isUpiId = (value: string) => UPI_ID_SHAPE.test(value.trim());

/** An amount in rupees: up to two decimals, more than zero; null when it isn't one. */
export function readAmount(value: string): number | null {
    const v = value.replace(/[,\s₹]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
    const n = Number(v);
    return n > 0 ? n : null;
}

const enc = (v: string) => encodeURIComponent(v.trim());

export interface UpiInput {
    upiId: string;
    name: string;
    /** Rupees; none lets the customer type it. */
    amount?: number | null;
    note?: string;
}

export function upiLink(i: UpiInput): string {
    const parts = [
        `pa=${enc(i.upiId).replace(/%40/g, "@")}`,
        `pn=${enc(i.name)}`,
    ];
    if (i.amount) parts.push(`am=${i.amount.toFixed(2)}`);
    parts.push("cu=INR");
    if (i.note?.trim()) parts.push(`tn=${enc(i.note)}`);
    return `upi://pay?${parts.join("&")}`;
}

export const WORDS = {
    form: "Your UPI details",
    upiId: "Your UPI ID",
    upiIdHint: "Like name@bank. Find it in your UPI app's profile.",
    upiIdBad: "That isn't a UPI ID yet. It looks like name@bank, with one @.",
    name: "Name customers will see",
    nameHint:
        "Use the name on your bank account, so the app shows the same name when they pay.",
    amount: "Amount",
    amountPlaceholder: "Leave empty to let them type it",
    amountBad: "Type the amount in rupees, like 250 or 250.50.",
    note: "Note",
    notePlaceholder: "Order 1042",
    eyebrow: "Scan to pay",
    sample: "A sample. Type your UPI ID to make yours.",
    needName: "Add the name customers will see to draw your code.",
    gate: "Get your QR code",
    gateButton: "Get my QR",
    after: "You get a PNG of the code, and a counter card with the safety line to print or save as a PDF.",
    png: "Download PNG",
    card: "Print counter card",
    cardLine: "The card carries the line “Check the name before you pay”.",
} as const;
