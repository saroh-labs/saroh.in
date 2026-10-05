/**
 * Hand the API's invoice PDF on to the browser (DEC-083), server-side only:
 * the pay link's and the receipt's routes both answer through here. The
 * bytes pass straight through, never kept; the answer is one person's bill,
 * so it is private, never cached, never sniffed into anything but a PDF,
 * and sends no referrer onward.
 *
 * A failure answers JSON with the status the page words
 * (`lib/invoice-pdf.ts` `pdfFailure`): the API's 404 and 429 as they are,
 * a 401 as a sign-in, anything else as a 502 — its words are the API's,
 * written for the merchant, and never passed on.
 */

const PRIVATE = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
} as const;

/** A failed download, with only its status. */
export function pdfUnavailable(status: number): Response {
    return Response.json({ ok: false }, { status, headers: PRIVATE });
}

/** The API's answer to a PDF request, as this app's. */
export function relayPdf(res: Response): Response {
    if (!res.ok || !res.body) {
        const status = res.ok
            ? 502
            : [401, 404, 429].includes(res.status)
              ? res.status
              : 502;
        return pdfUnavailable(status);
    }
    const disposition = res.headers.get("content-disposition");
    return new Response(res.body, {
        status: 200,
        headers: {
            ...PRIVATE,
            "content-type": "application/pdf",
            // Only the API's own `attachment; filename="…"`; a missing or
            // strange one becomes a plain attachment.
            "content-disposition":
                disposition &&
                /^attachment; filename="[A-Za-z0-9._-]+"$/.test(disposition)
                    ? disposition
                    : 'attachment; filename="invoice.pdf"',
        },
    });
}
