import type { Invoice, InvoiceTitle } from "./service";

/**
 * What a paper is called, and whether it prints tax columns (D15, default
 * 36). The API works both out from what was frozen on the paper when it was
 * issued — "Bill of supply" when a GST-registered business's every line is
 * exempt or nil-rated — so the list, the quick look and the paper all say
 * the same. An older API sends neither, and the title falls back to the
 * paper's GST: a tax invoice, a receipt once paid, an invoice before.
 */
export function paperTitle(
    i: Pick<Invoice, "gst" | "kind" | "standing" | "title">,
): InvoiceTitle {
    if (i.title) return i.title;
    if (i.kind === "CREDIT_NOTE") return "Credit note";
    if (i.gst) return "Tax invoice";
    return i.standing === "PAID" || i.standing === "CREDITED"
        ? "Receipt"
        : "Invoice";
}

/**
 * A registered business's paper with every line at 0%: it keeps its GSTIN
 * and SAC, and drops the place of supply, the taxable value and the CGST,
 * SGST or IGST — a bill of supply, or a credit note against one.
 */
export function isExemptPaper(i: Pick<Invoice, "gst" | "exempt">): boolean {
    return Boolean(i.gst && i.exempt);
}

/**
 * Whether a registered business's paper shows its GST totals (DEC-072) —
 * the taxable value, CGST and SGST or IGST, and "Prices include GST":
 * only when at least one line has a rate set, 0% included. A paper whose
 * every line has no rate set (a plan renewal's, on Rye) charges no GST it
 * can name, so it shows just its total. Lines not read yet keep the rows.
 * The API's `showsGstTotals` (`invoices/invoice-paper-view.ts`) says the
 * same on the PDF.
 */
export function showsGstTotals(i: Pick<Invoice, "lines">): boolean {
    if (!i.lines) return true;
    return i.lines.some((l) => {
        const rate = l.gst?.rate;
        return rate != null && rate.trim() !== "";
    });
}

/** The line at the foot of the paper: the law it is issued under, and how it stands. */
export function paperFooter(
    i: Pick<
        Invoice,
        "gst" | "exempt" | "kind" | "related" | "standing" | "tax"
    >,
    businessName: string,
): string {
    if (i.gst) {
        const exempt = isExemptPaper(i);
        const law =
            i.kind === "CREDIT_NOTE"
                ? `Credit note under section 34, CGST Act, against ${i.related?.number ?? "the invoice named above"}.`
                : exempt
                  ? "Bill of supply under section 31(3)(c), CGST Act."
                  : "Tax invoice under section 31, CGST Act.";
        // An exempt supply charges no GST, so reverse charge has nothing
        // to say about it.
        const basis = exempt
            ? " Supply exempt from GST."
            : " Reverse charge does not apply.";
        const state =
            i.standing === "CREDITED"
                ? " Cancelled by credit note."
                : i.standing === "PAID"
                  ? " Paid in full."
                  : "";
        return `${law}${basis}${state}`;
    }
    const paid =
        i.standing === "PAID"
            ? "Receipt — paid in full. "
            : i.standing === "VOID"
              ? "Void — this is not to be paid. "
              : i.standing === "CREDITED"
                ? "Cancelled by credit note. "
                : "";
    return Number(i.tax) > 0
        ? `${paid}${businessName} is not registered for GST.`
        : `${paid}${businessName} is not registered for GST, so no tax is charged.`;
}

/**
 * The line under Invoices' title when every paper the business has issued
 * is a bill of supply (after the design's clinic): null otherwise, so the
 * registered business's usual "GST tax invoices" line stands. A credit note
 * or a draft says nothing either way.
 */
export function exemptNote(
    invoices: readonly Pick<Invoice, "kind" | "status" | "title">[],
): string | null {
    const papers = invoices.filter(
        (i) => i.status !== "DRAFT" && i.kind !== "CREDIT_NOTE",
    );
    return papers.length > 0 &&
        papers.every((i) => i.title === "Bill of supply")
        ? "Exempt from GST, so these are bills of supply, not tax invoices."
        : null;
}

/**
 * What a line on the paper says about its GST (DEC-072): only where GST
 * applies. The API's `lineGstNote` (`invoices/invoice-paper-view.ts`) says
 * the same on the PDF.
 *
 * - No tax charged on the paper (an unregistered business's receipt, a
 *   bill of supply): nothing, whatever the line holds.
 * - A rate never set (null, like a plan renewal's line): nothing — not
 *   "Nil-rated", not "0%". Not set is not a 0% supply.
 * - A rate recorded as exactly 0: "Nil-rated".
 * - Above 0: "GST 18% · taxable ₹2,400".
 */
export function lineGstNote(
    taxed: boolean,
    gst: { rate: string | null; taxableValue: string | null } | null,
    money: (amount: string) => string,
): string | null {
    if (!taxed || gst?.rate == null || gst.rate.trim() === "") {
        return null;
    }
    const rate = Number(gst.rate);
    if (!Number.isFinite(rate)) return null;
    if (rate === 0) return "Nil-rated";
    return `GST ${rate}% · taxable ${money(gst.taxableValue ?? "0")}`;
}
