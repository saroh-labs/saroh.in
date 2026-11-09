import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { backPathOf, PaymentReturn } from "@saroh/site-blocks";

import { pricesPageHref } from "@/lib/module-pages";
import {
    cancelCheckout,
    paidQueryOf,
    provisionalView,
    readCheckoutSession,
} from "@/lib/payment-return";
import { getSiteForPage } from "@/lib/publication";

import { readPaid } from "./actions";

/**
 * Where Stripe's hosted Checkout sends a customer back to (plan
 * 2026-11-07-002, U8): on the business's own site, inside its header and
 * theme, never Saroh's. `?session_id=cs_…` after paying: "Confirming your
 * payment", asked again by itself, then booked, paid, processing, failed,
 * closed or being refunded. `?cancelled=1&intent=…&token=…` from Stripe's
 * Back link: the checkout is closed (a booking hold lets its place go) and
 * the customer goes back to where they paid from.
 *
 * The session id and the cancel token are credentials, so the page is
 * noindex, sends no referrer, and is a private path (never cached).
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

export default async function PaidPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string }>;
    searchParams: Query;
}) {
    const [{ domain }, query] = await Promise.all([params, searchParams]);
    const read = paidQueryOf(query);
    if (!read) notFound();
    const site = await getSiteForPage(domain);
    if (!site) notFound();
    const pricesPath = pricesPageHref(site.snapshot.pages, site.modules);

    if (read.kind === "cancel") {
        const view = await cancelCheckout(read.intent, read.token);
        if (view === "missing") notFound();
        // Couldn't say: home, and the checkout closes on its own.
        redirect(view ? backPathOf(view, pricesPath) : "/");
    }

    const view = await readCheckoutSession(read.sessionId);
    if (view === "missing") notFound();
    return (
        <PaymentReturn
            initial={view ?? provisionalView(site.snapshot.site.name)}
            read={readPaid.bind(null, read.sessionId)}
            pricesPath={pricesPath}
        />
    );
}
