import type { Metadata } from "next";

import { SiteTheme } from "@saroh/site-blocks";

import { OrderPay } from "@/components/order-pay";
import { getPayOrder } from "@/lib/order-pay";

/**
 * A customer paying for an order from its pay link (plan B, B11). On this
 * service's own apex, as the invoice pay page is, wearing the business's
 * site theme, never Saroh's.
 *
 * The link is a credential: the page is noindex and sends no referrer, so
 * the token never leaves in a Referer header.
 */
export const metadata: Metadata = {
    title: "Pay for your order",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

const GONE: Record<
    "missing" | "busy" | "unavailable",
    { title: string; body: string }
> = {
    missing: {
        title: "This link no longer works",
        body: "If you've just paid, you're done — the business has it. Otherwise the order may have been cancelled, or they sent you a newer link. Ask them for the latest one.",
    },
    busy: {
        title: "Too many tries at once",
        body: "Wait a minute, then open the link again.",
    },
    unavailable: {
        title: "We couldn't open your order",
        body: "Something went wrong on our side. Try the link again in a moment.",
    },
};

export default async function OrderPayPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getPayOrder(token);

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

    const { order } = result;
    return (
        <main className="min-h-screen bg-site-bg text-site-body">
            {order.theme ? <SiteTheme variables={order.theme} /> : null}
            <OrderPay token={token} order={order} />
        </main>
    );
}
