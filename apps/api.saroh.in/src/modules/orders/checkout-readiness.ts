import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { payLinkProvider } from "../payments/pay-link-provider";

/**
 * Whether a storefront can take an online order now (round-2 G13): it isn't
 * paused, and a provider can open a checkout window for it — the pay-link
 * rule (B11, `payLinkProvider`): the storefront's chosen provider, else the
 * business's first connection that can open a window. A Razorpay connection
 * missing its public key id counts as none (DEC-054).
 *
 * The site's checkout options, its start, and the editor's pre-publish flag
 * all ask this one question, so they never disagree. Which methods the
 * customer pays with is the provider account's business (DEC-059); nothing
 * here names or limits them.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "merchantPaymentProvider" | "storeSettings"
>;

export type CheckoutReadiness =
    { ok: true } | { ok: false; reason: "paused" | "no-provider" };

export async function checkoutReadiness(
    db: Db,
    organizationId: string,
    storeId: string,
): Promise<CheckoutReadiness> {
    const settings = await db.storeSettings.findUnique({
        where: { storeId },
        select: { pausedAt: true },
    });
    if (settings?.pausedAt) return { ok: false, reason: "paused" };
    try {
        await payLinkProvider(db, organizationId, storeId);
        return { ok: true };
    } catch (error) {
        if (error instanceof ConflictException) {
            return { ok: false, reason: "no-provider" };
        }
        throw error;
    }
}

/** What the editor tells the merchant when their site can't take orders. */
export function readinessMessage(reason: "paused" | "no-provider"): string {
    return reason === "paused"
        ? "Your storefront is paused, so your site can't take orders. Customers see “Ask about ordering” instead."
        : "Connect payments to take orders online. Until then, customers see “Ask about ordering” instead.";
}
