/**
 * "Download PDF" for the customer (DEC-083): the issued invoice the business
 * sent them, drawn by the API on request and never stored — from the pay
 * link (`/pay/<token>/pdf`, the token is the authority) and from a receipt
 * in their account (`/account/receipts/<id>/pdf`, their session is). Both
 * are this app's own routes, so the token and the session go server to
 * server, never from the browser to the API.
 *
 * Client-safe: no server imports. The words are the customer's, never the
 * API's (which are written for the merchant).
 */

/** The pay link's PDF route, beside its page. */
export function payPdfHref(token: string): string {
    return `/pay/${encodeURIComponent(token)}/pdf`;
}

/** A receipt's PDF route, beside its page. */
export function receiptPdfHref(invoiceId: string): string {
    return `/account/receipts/${encodeURIComponent(invoiceId)}/pdf`;
}

/** A void invoice has no PDF to hand out: nobody is given a void bill. */
export function hasCustomerPdf(status: string): boolean {
    return status !== "VOID";
}

/** "KD/26-27/0012" → "KD-26-27-0012.pdf": the API's name for it. */
export function pdfFileName(number: string | null | undefined): string {
    const safe = (number ?? "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return `${safe || "invoice"}.pdf`;
}

/** The name in `attachment; filename="…"`, else one from the number. */
export function fileNameFrom(
    disposition: string | null,
    number: string | null | undefined,
): string {
    const named = disposition?.match(/filename="([^"]+)"/)?.[1];
    return named ?? pdfFileName(number);
}

/** What a failed download says, by its status. */
export function pdfFailure(status: number): string {
    if (status === 401) return "Sign in again to download your receipt.";
    if (status === 404) {
        return "This invoice's PDF isn't available. The business may have sent you a newer link — ask them for the latest one.";
    }
    if (status === 429)
        return "Too many downloads at once. Wait a minute, then try again.";
    return "We couldn't make the PDF. Try again in a moment.";
}

export type PdfFetch =
    { ok: true; blob: Blob; fileName: string } | { ok: false; error: string };

/** Fetch the PDF from this app's route; a failure says why, in our words. */
export async function fetchInvoicePdf(
    href: string,
    number: string | null | undefined,
    fetchImpl: typeof fetch = fetch,
): Promise<PdfFetch> {
    let res: Response;
    try {
        res = await fetchImpl(href, { cache: "no-store" });
    } catch {
        return {
            ok: false,
            error: "We couldn't reach the server. Check your connection and try again.",
        };
    }
    if (!res.ok) return { ok: false, error: pdfFailure(res.status) };
    return {
        ok: true,
        blob: await res.blob(),
        fileName: fileNameFrom(res.headers.get("content-disposition"), number),
    };
}

/** Hand a fetched PDF to the browser to save. Browser only. */
export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
