"use server";

import type { PaymentReturnView } from "@saroh/site-blocks";

import { siteOrigin } from "@/lib/origin";
import { readCheckoutSession } from "@/lib/payment-return";

/**
 * Where a Stripe hosted Checkout payment stands, asked again by the `/paid`
 * page while it is being confirmed (U8). Checks `Origin` first, as every
 * action here does. Null: it couldn't say, and the page asks again.
 */
export async function readPaid(
    sessionId: string,
): Promise<PaymentReturnView | null> {
    if (!(await siteOrigin())) return null;
    if (typeof sessionId !== "string") return null;
    const view = await readCheckoutSession(sessionId);
    return view === "missing" ? null : view;
}
