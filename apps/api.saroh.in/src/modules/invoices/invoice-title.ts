import { rateToBps } from "./gst";

/**
 * What a paper is called (D15, default 36) — pure, from what was frozen on
 * it when it was issued, never from today's settings.
 *
 * A GST-registered business's paper whose every line is exempt or
 * nil-rated (a frozen `gstRate` of exactly 0) is a **bill of supply**
 * (CGST Act s. 31(3)(c), rule 49): no tax columns, the same number series,
 * no new kind. A null rate on a registered business's line is "not set",
 * not exempt, so that paper stays a tax invoice. A credit note is a credit
 * note whatever it corrects. An unregistered business's paper is a receipt
 * once it is paid (or cancelled by a credit note), an invoice before.
 */

export type InvoiceTitle =
    "Tax invoice" | "Bill of supply" | "Credit note" | "Receipt" | "Invoice";

interface Rate {
    toString(): string;
}

export interface Paper {
    kind?: string | null;
    /** Frozen on issue: set means the business was registered then. */
    sellerGstin?: string | null;
}

/** A line's frozen rate is exactly 0: exempt or nil-rated, never "not set". */
export function isExemptRate(rate: Rate | null | undefined): boolean {
    return rate != null && rateToBps(rate) === 0;
}

/**
 * A registered business's paper with every line exempt or nil-rated. A
 * paper with no lines is not: there is nothing to call exempt.
 */
export function isExemptSupply(
    paper: Paper & { lines: readonly { gstRate?: Rate | null }[] },
): boolean {
    if (!paper.sellerGstin || paper.lines.length === 0) return false;
    return paper.lines.every((l) => isExemptRate(l.gstRate));
}

/** `exempt` is `isExemptSupply` of the paper, however it was read. */
export function invoiceTitle(
    paper: Paper & { standing: string },
    exempt: boolean,
): InvoiceTitle {
    if (paper.kind === "CREDIT_NOTE") return "Credit note";
    if (paper.sellerGstin) return exempt ? "Bill of supply" : "Tax invoice";
    return paper.standing === "PAID" || paper.standing === "CREDITED"
        ? "Receipt"
        : "Invoice";
}

/**
 * Whether a customer-facing paper (the pay link, a receipt in the account
 * area) is a bill of supply — the one fact those allow-lists carry about
 * GST, so they say what the merchant's copy says without sending rates.
 */
export function isBillOfSupply(
    paper: Paper & { lines: readonly { gstRate?: Rate | null }[] },
): boolean {
    return paper.kind !== "CREDIT_NOTE" && isExemptSupply(paper);
}
