/**
 * "Download PDF" on Invoice Detail (D16). The API draws the issued paper on
 * request and names it for the invoice's number; the browser fetches it
 * through this app's own `/api/invoices/:id/pdf` (the session stays
 * server-side, as for search) and saves it. Client-safe: no server imports.
 */

/** Whether a paper can be downloaded: it is issued, so it has a number. */
export function hasPdf(i: {
    number: string | null;
    standing: string;
}): boolean {
    return Boolean(i.number) && i.standing !== "DRAFT";
}

/** "KD/26-27/0012" → "KD-26-27-0012.pdf" — the API's name for it. */
export function pdfFileName(number: string | null): string {
    const safe = (number ?? "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return `${safe || "invoice"}.pdf`;
}

/** The name in `attachment; filename="…"`, else one from the number. */
export function fileNameFrom(
    disposition: string | null,
    number: string | null,
): string {
    const named = disposition?.match(/filename="([^"]+)"/)?.[1];
    return named ?? pdfFileName(number);
}

/** What a failed download says, by status, when the API gave no words. */
export function pdfFailure(status: number): string {
    if (status === 403) return "Your role can't download this invoice.";
    if (status === 404) return "This invoice wasn't found.";
    if (status === 409) return "A draft has no PDF yet. Issue it first.";
    return "Couldn't make the PDF. Try again.";
}

/** Fetch the paper and hand it to the browser to save. */
export async function downloadInvoicePdf(invoice: {
    id: string;
    number: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    let res: Response;
    try {
        res = await fetch(
            `/api/invoices/${encodeURIComponent(invoice.id)}/pdf`,
            { cache: "no-store" },
        );
    } catch {
        return {
            ok: false,
            error: "Couldn't reach Saroh. Check your connection and try again.",
        };
    }
    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
            error?: unknown;
        } | null;
        return {
            ok: false,
            error:
                typeof body?.error === "string" && body.error
                    ? body.error
                    : pdfFailure(res.status),
        };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameFrom(
        res.headers.get("content-disposition"),
        invoice.number,
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true };
}
