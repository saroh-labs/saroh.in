import { apiFetch, orgBase } from "@/lib/api/http";

import { toFailure } from "@/lib/api/failure";
import { pdfFailure } from "@/lib/invoices/pdf";

/**
 * The issued paper's PDF from the API (D16), for the app's own download
 * route. Server-only (`apiFetch` forwards the session and the active
 * organization), so the browser never holds the API's address or a
 * session header, and cannot ask another business's invoice.
 */
export async function getInvoicePdf(
    invoiceId: string,
): Promise<
    | { ok: true; body: ReadableStream<Uint8Array>; disposition: string | null }
    | { ok: false; status: number; error: string }
> {
    const base = await orgBase();
    if (!base) {
        return { ok: false, status: 404, error: pdfFailure(404) };
    }
    const res = await apiFetch(
        `${base}/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    );
    if (!res.ok || !res.body) {
        const status = res.ok ? 502 : res.status;
        // A server failure's words are generic: say ours instead.
        const body: unknown =
            status >= 500 ? null : await res.json().catch(() => null);
        return {
            ok: false,
            status,
            error: toFailure(body, pdfFailure(status)).error,
        };
    }
    return {
        ok: true,
        body: res.body,
        disposition: res.headers.get("content-disposition"),
    };
}
