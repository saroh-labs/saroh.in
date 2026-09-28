"use server";

import { headers } from "next/headers";

import type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    ShopResult,
} from "@saroh/site-blocks";

import { accountSitesFetch, sitesFetch } from "@/lib/customer-session";
import { servedHost, siteOrigin } from "@/lib/origin";
import { getSiteForHost } from "@/lib/publication";
import {
    isQuote,
    isStanding,
    isStarted,
    quoteBody,
    resultOf,
    SHOP_TROUBLE,
    startBody,
} from "@/lib/shop-checkout-shape";

/**
 * The bag and checkout on a merchant's site (round-2 G13): price the bag,
 * start paying, and ask how a started checkout stands. Not under a
 * `shop/checkout` segment, which would shadow a product slugged `checkout`.
 *
 * Each runs on this server: the site comes from the host this request is
 * on (never from the browser), every call carries the signed relay, and
 * starting carries the customer's session from its host-only cookie. What
 * the browser sent is rebuilt field by field (`shop-checkout-shape.ts`), so
 * no amount travels on. Every action checks `Origin` first.
 */

interface Refusal {
    ok: false;
    reason: "error" | "invalid" | "signed-out";
    message: string;
}

const TROUBLE: Refusal = { ok: false, reason: "error", message: SHOP_TROUBLE };
const INVALID: Refusal = {
    ok: false,
    reason: "invalid",
    message: "Check your bag and try again.",
};
const OFFLINE: Refusal = {
    ok: false,
    reason: "error",
    message:
        "We couldn't reach the shop — check your connection and try again.",
};
const SIGNED_OUT: Refusal = {
    ok: false,
    reason: "signed-out",
    message: "Sign in to place your order.",
};

/** The site this request is on. */
async function hostSiteId(): Promise<string | null> {
    const host = servedHost(await headers());
    const resolved = await getSiteForHost(host);
    return resolved?.siteId ?? null;
}

export async function quoteBag(
    request: unknown,
): Promise<ShopResult<CheckoutQuote>> {
    if (!(await siteOrigin())) return TROUBLE;
    const body = quoteBody(request);
    if (!body) return INVALID;
    const siteId = await hostSiteId();
    if (!siteId) return TROUBLE;
    const call = await sitesFetch(
        `${encodeURIComponent(siteId)}/checkout/quote`,
        { method: "POST", body },
    );
    if (!call.ok) return OFFLINE;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isQuote,
    );
}

export async function startCheckout(
    request: unknown,
): Promise<ShopResult<CheckoutStarted>> {
    if (!(await siteOrigin())) return TROUBLE;
    const body = startBody(request);
    if (!body) return INVALID;
    const siteId = await hostSiteId();
    if (!siteId) return TROUBLE;
    const call = await accountSitesFetch(
        `${encodeURIComponent(siteId)}/checkout`,
        { method: "POST", body },
    );
    // No session cookie at all: sign in first.
    if (!call) return SIGNED_OUT;
    if (!call.ok) return OFFLINE;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isStarted,
    );
}

export async function checkoutStanding(
    orderId: string,
): Promise<ShopResult<CheckoutStanding>> {
    if (!(await siteOrigin())) return TROUBLE;
    if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) {
        return INVALID;
    }
    const siteId = await hostSiteId();
    if (!siteId) return TROUBLE;
    const call = await accountSitesFetch(
        `${encodeURIComponent(siteId)}/checkout/orders/${orderId}`,
    );
    if (!call) return SIGNED_OUT;
    if (!call.ok) return OFFLINE;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isStanding,
    );
}
