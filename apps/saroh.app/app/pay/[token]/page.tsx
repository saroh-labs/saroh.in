import type { Metadata } from "next";

import { SiteTheme } from "@saroh/site-blocks";

import { InvoicePay } from "@/components/invoice-pay";
import { getPayInvoice } from "@/lib/invoice-pay";

/**
 * A customer paying an invoice from its pay link (ADR-007, U13). On this
 * service's own apex — an invoice belongs to a business, not to a Site, so
 * there is no tenant host to choose — wearing the business's site theme,
 * never Saroh's.
 *
 * The link is a credential: the page is noindex and sends no referrer, so the
 * token never leaves in a Referer header to anything the page links to.
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
    return (
        <main className="min-h-screen bg-site-bg text-site-body">
            {invoice.theme ? <SiteTheme variables={invoice.theme} /> : null}
            <InvoicePay token={token} invoice={invoice} />
        </main>
    );
}
