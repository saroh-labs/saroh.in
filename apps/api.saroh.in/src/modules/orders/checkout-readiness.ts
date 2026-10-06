import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { planTakesOnlinePayment } from "../billing/online-payments-plan";
import { payLinkProvider } from "../payments/pay-link-provider";
import type { StorefrontFulfilmentType } from "./fulfilment";

/**
 * Whether a storefront can take an order at the site's checkout now
 * (round-2 G13), and how the customer may pay for it.
 *
 * - **Paused** storefronts take nothing.
 * - **Online** — paying in the provider's window — needs a plan with
 *   online payments (`billing/online-payments-plan.ts`) and a provider
 *   that can open a checkout window: the pay-link rule (B11,
 *   `payLinkProvider`), the storefront's chosen provider, else the
 *   business's first connection that can open one. A Razorpay connection
 *   missing its public key id counts as none (DEC-054).
 * - **On handover** — "Pay when you collect", "Pay on delivery" (the
 *   owner's rule, 2026-10-06: online needs a paid plan, Free takes money
 *   offline). On a plan without online payments it is always offered: it
 *   is the only way to pay there. On a plan with them it is offered only
 *   when the storefront turns it on (`StoreSettings.offerPayOnHandover`,
 *   off by default).
 *
 * Neither way open is "can't order": the site offers "Ask about ordering".
 * The site's checkout options, its start, and the editor's pre-publish flag
 * all ask this one question, so they never disagree. A payment already
 * started still lands through its webhook whatever this says. Which
 * methods the customer pays with online is the provider account's business
 * (DEC-059); nothing here names or limits them.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "merchantPaymentProvider" | "storeSettings"
>;

export type CheckoutBlocker = "paused" | "no-provider";

/** How a site order may be paid. */
export type CheckoutPayment = "ONLINE" | "ON_HANDOVER";

export type CheckoutReadiness =
    | { ok: true; online: boolean; onHandover: boolean }
    | { ok: false; reason: CheckoutBlocker };

export async function checkoutReadiness(
    db: Db,
    organizationId: string,
    storeId: string,
): Promise<CheckoutReadiness> {
    const settings = await db.storeSettings.findUnique({
        where: { storeId },
        select: { pausedAt: true, offerPayOnHandover: true },
    });
    if (settings?.pausedAt) return { ok: false, reason: "paused" };
    if (!(await planTakesOnlinePayment(organizationId))) {
        // Free takes money offline: no provider is asked.
        return { ok: true, online: false, onHandover: true };
    }
    const onHandover = settings?.offerPayOnHandover === true;
    const online = await providerReady(db, organizationId, storeId);
    if (!online && !onHandover) return { ok: false, reason: "no-provider" };
    return { ok: true, online, onHandover };
}

async function providerReady(
    db: Db,
    organizationId: string,
    storeId: string,
): Promise<boolean> {
    try {
        await payLinkProvider(db, organizationId, storeId);
        return true;
    } catch (error) {
        if (error instanceof ConflictException) return false;
        throw error;
    }
}

/**
 * The ways paying on handover is offered for one way the order leaves:
 * collected from the storefront, or brought by the business's own people.
 * A shipment goes by courier, who collects no money for the business
 * (Saroh books no courier, DEC-045), so it is paid online or not at all.
 */
export function paysOnHandover(way: StorefrontFulfilmentType): boolean {
    return way === "PICKUP" || way === "LOCAL_DELIVERY";
}

/** "Pay when you collect" or "Pay on delivery", for a way that has one. */
export function onHandoverLabel(way: string): string | null {
    if (way === "PICKUP") return "Pay when you collect";
    if (way === "LOCAL_DELIVERY") return "Pay on delivery";
    return null;
}

/** A way to pay, as the site's bag draws it. */
export interface CheckoutPayOption {
    type: CheckoutPayment;
    label: string;
}

/**
 * How an order leaving this way can be paid, given what the storefront is
 * ready for: online first, then on handover. Empty when neither fits (a
 * shipment where only paying on handover is open).
 */
export function payOptionsFor(
    ready: { online: boolean; onHandover: boolean },
    way: StorefrontFulfilmentType,
): CheckoutPayOption[] {
    const options: CheckoutPayOption[] = [];
    if (ready.online) options.push({ type: "ONLINE", label: "Pay online" });
    const offline = onHandoverLabel(way);
    if (ready.onHandover && offline) {
        options.push({ type: "ON_HANDOVER", label: offline });
    }
    return options;
}

/**
 * The storefront's ways an order may leave, kept to those that can be
 * paid: with only paying on handover open, a shipment can't be.
 */
export function payableWays<T extends StorefrontFulfilmentType>(
    ready: { online: boolean; onHandover: boolean },
    ways: readonly T[],
): T[] {
    return ways.filter((way) => payOptionsFor(ready, way).length > 0);
}

/** What the editor tells the merchant when their site can't take orders. */
export function readinessMessage(reason: CheckoutBlocker): string {
    switch (reason) {
        case "paused":
            return "The location your online shop sells from is paused, so your site can't take orders. Customers see “Ask about ordering” instead.";
        case "no-provider":
            return "Connect payments, or let customers pay when they collect, to take orders on your site. Until then, customers see “Ask about ordering” instead.";
    }
}
