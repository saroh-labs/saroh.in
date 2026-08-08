import type { Metadata } from "next";

import Checkout from "@/components/checkout";

/**
 * PUBLIC buyer checkout + receipt page (S5-004), reached on a tenant host at
 * `/checkout/:orderId` (middleware rewrites the host into the `[domain]` segment,
 * so the site header/layout still wraps it). The owning organization and the
 * charged amount are resolved server-side from the Order by the public API — this
 * page never sees or sends an amount. The interactive work lives in the
 * {@link Checkout} client component.
 */

export const metadata: Metadata = {
    title: "Checkout",
    robots: { index: false, follow: false },
};

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ domain: string; orderId: string }>;
}) {
    const { orderId } = await params;
    return <Checkout orderId={orderId} />;
}
