import type { Invoice } from "./service";

/** The seller as a paper prints it: name, legal name, contact email. */
export interface PrintedSeller {
    name: string;
    legalName: string | null;
    email: string | null;
}

/**
 * Who the paper says it is from (DEC-082). An issued invoice prints the
 * business's name, legal name and contact email as they were when it was
 * issued — frozen on it by the API, like its GSTIN and address — so renaming
 * the business never changes paper already issued. A draft prints today's
 * settings. A frozen name marks all three as frozen: a legal name or email
 * left blank at issue stays blank.
 *
 * Every issued invoice carries them since the backfill; one that doesn't (a
 * row written outside the API, or an older API) falls back to today's
 * rather than print no seller. The API's `printedSeller`
 * (`invoices/invoice-paper-view.ts`) says the same on the PDF.
 */
export function printedSeller(
    i: Pick<
        Invoice,
        "status" | "sellerName" | "sellerLegalName" | "sellerEmail"
    >,
    today: PrintedSeller,
): PrintedSeller {
    if (i.status === "DRAFT" || !i.sellerName) return today;
    return {
        name: i.sellerName,
        legalName: i.sellerLegalName ?? null,
        email: i.sellerEmail ?? null,
    };
}
