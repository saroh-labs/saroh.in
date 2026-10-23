import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SiteTheme } from "@saroh/site-blocks";

import { InvoicePay } from "@/components/invoice-pay";
import { PayLinkGone } from "@/components/pay-link-gone";
import { publicApiUrl } from "@/lib/api-url";
import { getPayInvoice } from "@/lib/invoice-pay";
import { payPdfHref } from "@/lib/invoice-pdf";
import { payRedirect, TENANT_HOST_HEADER } from "@/lib/pay-host";
import { SITE_FACES } from "@/lib/site-fonts";

/**
 * A customer paying an invoice from its pay link (ADR-007, U13), wearing
 * the business's site theme, never Saroh's. Served on this service's apex,
 * and on the business's own address by the middleware's rewrite (DEC-069,
 * L6); opened on any other business's host, it sends the customer to the
 * link's own address (`lib/pay-host.ts`).
 *
 * The link is a credential: the page is noindex and sends no referrer, so the
 * token never leaves in a Referer header to anything the page links to. Its
 * "Download PDF" (DEC-083) is this app's `pdf/route.ts` beside it, which
 * asks the API server to server, as the page's own read does.
 */
// One read for the tab's title and the page.
const readInvoice = cache(getPayInvoice);

/** "Pay Rye & Co." in the tab; the plain title when the link doesn't open. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string }>;
}): Promise<Metadata> {
    const result = await readInvoice((await params).token);
    return {
        title: result.ok
            ? `Pay ${result.invoice.businessName}`
            : "Pay your invoice",
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}

export default async function PayPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await readInvoice(token);

    if (!result.ok) return <PayLinkGone reason={result.reason} />;

    const { invoice } = result;
    const elsewhere = payRedirect(
        (await headers()).get(TENANT_HOST_HEADER),
        invoice.payUrl,
    );
    if (elsewhere) redirect(elsewhere);
    return (
        <main className="min-h-screen bg-site-bg text-site-body">
            {invoice.theme ? (
                <SiteTheme variables={invoice.theme} faces={SITE_FACES} />
            ) : null}
            <InvoicePay
                token={token}
                invoice={invoice}
                apiUrl={publicApiUrl()}
                pdfHref={payPdfHref(token)}
            />
        </main>
    );
}
