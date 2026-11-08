import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { backPathOf, PaymentReturn } from "@saroh/site-blocks";

import { readPaid } from "@/app/[domain]/paid/actions";
import {
    cancelCheckout,
    paidQueryOf,
    provisionalView,
    readCheckoutSession,
} from "@/lib/payment-return";

/**
 * The `/paid` page on this service's apex (U8), for a business with no
 * live site: Stripe's hosted Checkout comes back here, as a pay link opens
 * here (`/pay/<token>`). The same states as `[domain]/paid`, without a
 * site's header. Noindex, no referrer: the address holds credentials.
 */
type Query = Promise<{
    session_id?: string | string[];
    cancelled?: string | string[];
    intent?: string | string[];
    token?: string | string[];
}>;

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Query;
}): Promise<Metadata> {
    const read = paidQueryOf(await searchParams);
    return {
        title: read ? "Your payment" : "Page not found",
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}

export default async function ApexPaidPage({
    searchParams,
}: {
    searchParams: Query;
}) {
    const read = paidQueryOf(await searchParams);
    if (!read) notFound();

    if (read.kind === "cancel") {
        const view = await cancelCheckout(read.intent, read.token);
        if (view === "missing") notFound();
        // A pay link's own page is the stored return path; nothing else
        // lives on the apex.
        redirect(view ? backPathOf(view) : "/");
    }

    const view = await readCheckoutSession(read.sessionId);
    if (view === "missing") notFound();
    return (
        <main className="min-h-screen bg-site-bg text-site-body">
            <PaymentReturn
                initial={view ?? provisionalView("the business")}
                read={readPaid.bind(null, read.sessionId)}
            />
        </main>
    );
}
