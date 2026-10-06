import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SiteTheme } from "@saroh/site-blocks";

import { InvoicePay } from "@/components/invoice-pay";
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
export const metadata: Metadata = {
    title: "Pay your invoice",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

const GONE: Record<
    "missing" | "busy" | "unavailable",
    { title: string; body: string }
> = {
    missing: {
        title: "This link no longer works",
        body: "The invoice may have been cancelled, or the business may have sent you a newer link. Ask them for the latest one.",
    },
    busy: {
        title: "Too many tries at once",
        body: "Wait a minute, then open the link again.",
    },
    unavailable: {
        title: "We couldn't open your invoice",
        body: "Something went wrong on our side. Try the link again in a moment.",
    },
};

export default async function PayPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getPayInvoice(token);

    if (!result.ok) {
        const copy = GONE[result.reason];
        return (
            <main className="min-h-screen bg-site-bg text-site-body">
                <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
                    <h1 className="text-2xl font-bold tracking-tight text-site-fg">
                        {copy.title}
                    </h1>
                    <p className="mt-2 text-site-muted">{copy.body}</p>
                </section>
            </main>
        );
    }

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
