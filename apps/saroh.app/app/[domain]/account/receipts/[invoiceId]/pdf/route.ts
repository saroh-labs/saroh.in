import { accountFetch } from "@/lib/customer-session";
import { pdfUnavailable, relayPdf } from "@/lib/invoice-pdf-relay";

/**
 * "Download PDF" on a receipt (DEC-083): the customer's own paid invoice,
 * drawn by the API on request and never stored. Authorised by their
 * session and the site's signed relay exactly as the receipt's read is
 * (`accountFetch`); another customer's invoice is the API's 404, and so is
 * the whole account area while it is switched off (the middleware's 404
 * comes first).
 */
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ invoiceId: string }> },
) {
    const { invoiceId } = await params;
    const call = await accountFetch(
        `me/receipts/${encodeURIComponent(invoiceId)}/pdf`,
    );
    if (!call) return pdfUnavailable(401);
    if (!call.ok) return pdfUnavailable(502);
    return relayPdf(call.res);
}
