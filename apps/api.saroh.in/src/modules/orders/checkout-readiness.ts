import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { planTakesOnlinePayment } from "../billing/online-payments-plan";
import { payLinkProvider } from "../payments/pay-link-provider";

/**
 * Whether a storefront can take an online order now (round-2 G13): it isn't
 * paused, and a provider can open a checkout window for it — the pay-link
 * rule (B11, `payLinkProvider`): the storefront's chosen provider, else the
 * business's first connection that can open a window. A Razorpay connection
 * missing its public key id counts as none (DEC-054).
 *
 * The site's checkout options, its start, and the editor's pre-publish flag
 * all ask this one question, so they never disagree. A plan without online
 * payments (`billing/online-payments-plan.ts`) takes no new checkout
 * either: the site offers "Ask about ordering", and a payment already
 * started still lands through its webhook. Which methods the
 * customer pays with is the provider account's business (DEC-059); nothing
 * here names or limits them.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "merchantPaymentProvider" | "storeSettings"
>;

export type CheckoutBlocker = "paused" | "no-provider" | "plan";

export type CheckoutReadiness =
    { ok: true } | { ok: false; reason: CheckoutBlocker };

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
    if (!(await planTakesOnlinePayment(organizationId))) {
        return { ok: false, reason: "plan" };
    }
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
export function readinessMessage(reason: CheckoutBlocker): string {
    switch (reason) {
        case "paused":
            return "The location your online shop sells from is paused, so your site can't take orders. Customers see “Ask about ordering” instead.";
        case "plan":
            return "Your plan doesn't include taking payment online, so your site can't take orders. Customers see “Ask about ordering” instead.";
        case "no-provider":
            return "Connect payments to take orders online. Until then, customers see “Ask about ordering” instead.";
    }
}
