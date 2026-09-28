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
