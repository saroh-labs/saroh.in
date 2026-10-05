import { serverApiUrl } from "@/lib/api-url";
import { pdfUnavailable, relayPdf } from "@/lib/invoice-pdf-relay";
import { withRelayFrom } from "@/lib/relay-headers";

/**
 * "Download PDF" on a pay link (DEC-083): the issued invoice, drawn by the
 * API on request from the token alone (`GET /public/invoices/:token/pdf`)
 * and never stored. Server to server, as the pay page's own read is, so the
 * token never goes from the browser to the API. A bad, replaced or void
 * link is the API's 404. Served on a business's own address too: the
 * middleware's pay path includes it (`lib/pay-host.ts`).
 */
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;
    let res: Response;
    try {
        res = await fetch(
            `${serverApiUrl()}/public/invoices/${encodeURIComponent(token)}/pdf`,
            {
                cache: "no-store",
                headers: withRelayFrom(request.headers, {
                    accept: "application/pdf",
                }),
            },
        );
    } catch {
        return pdfUnavailable(502);
    }
    return relayPdf(res);
}
