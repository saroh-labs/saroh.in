"use server";

import { headers } from "next/headers";

import type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    DeliveryAddress,
    ShopResult,
    WatchOffer,
    WatchResult,
    WatchTaken,
    WatchView,
} from "@saroh/site-blocks";
import {
    cleanWatchEmail,
    isWatchOffer,
    isWatchTaken,
    isWatchView,
    TEST_RELEASE_MESSAGE,
    TEST_RELEASE_REASON,
    WATCH_WORDS,
    watchResultOf,
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
    savedAddressOf,
    SHOP_TROUBLE,
    startBody,
} from "@/lib/shop-checkout-shape";
import { testMode } from "@/lib/test-release";

/**
 * The bag and checkout on a merchant's site (round-2 G13): price the bag,
 * start paying, and ask how a started checkout stands. Not under a
 * `shop/checkout` segment, which would shadow a product slugged `checkout`.
 *
 * Each runs on this server: the site comes from the host this request is
 * on (never from the browser), every call carries the signed relay, and
 * starting carries the customer's session from its host-only cookie. What
 * the browser sent is rebuilt field by field (`shop-checkout-shape.ts`), so
 * no amount travels on. Every action checks `Origin` first, and starting
 * refuses on a test release (DEC-071, T6) before anything is sent.
 */

interface Refusal {
    ok: false;
    reason: "error" | "invalid" | "signed-out" | "test-release";
    message: string;
}

/** A test release (DEC-071, T6): nothing is ordered, and nothing is sent. */
const TEST_REFUSAL: Refusal = {
    ok: false,
    reason: TEST_RELEASE_REASON,
    message: TEST_RELEASE_MESSAGE,
};

const TROUBLE: Refusal = { ok: false, reason: "error", message: SHOP_TROUBLE };
const INVALID: Refusal = {
    ok: false,
    reason: "invalid",
    message: "Check your bag and try again.",
};
const OFFLINE: Refusal = {
    ok: false,
    reason: "error",
    message: "We couldn't reach the shop. Check your connection and try again.",
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
    if (await testMode()) return TEST_REFUSAL;
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

/**
 * Where the signed-in customer's last delivery went, for the bag to read
 * out instead of asking again. Null when they have had none. Never a
 * reason to hold the bag: any failure reads as "ask for the address".
 */
export async function savedDeliveryAddress(): Promise<
    ShopResult<DeliveryAddress | null>
> {
    if (!(await siteOrigin())) return TROUBLE;
    const siteId = await hostSiteId();
    if (!siteId) return TROUBLE;
    const call = await accountSitesFetch(
        `${encodeURIComponent(siteId)}/checkout/address`,
    );
    if (!call) return SIGNED_OUT;
    if (!call.ok) return OFFLINE;
    if (!call.res.ok) return TROUBLE;
    const answer = savedAddressOf(await call.res.json().catch(() => null));
    return answer ? { ok: true, data: answer.address } : TROUBLE;
}

// ── "Tell me when it's back" (DEC-174, U24, #1155) ─────────────────────────

const WATCH_TROUBLE = {
    ok: false as const,
    reason: "error" as const,
    message: WATCH_WORDS.error,
};
const WATCH_OFFLINE = {
    ok: false as const,
    reason: "error" as const,
    message: WATCH_WORDS.offline,
};
const WATCH_TEST = {
    ok: false as const,
    reason: TEST_RELEASE_REASON as typeof TEST_RELEASE_REASON,
    message: TEST_RELEASE_MESSAGE,
};
/** A product or option id as the API makes them: never a path. */
const WATCH_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A stop token (`v1.<id>.<sig>`), checked by shape only: the API verifies it. */
const WATCH_TOKEN = /^[A-Za-z0-9._-]{1,120}$/;

function watchIds(
    productId: unknown,
    variantId: unknown,
): { productId: string; variantId: string | null } | null {
    if (typeof productId !== "string" || !WATCH_ID.test(productId)) {
        return null;
    }
    if (variantId === null || variantId === undefined) {
        return { productId, variantId: null };
    }
    return typeof variantId === "string" && WATCH_ID.test(variantId)
        ? { productId, variantId }
        : null;
}

/**
 * Whether the product page offers "Tell me" for the option on screen: read
 * in the browser, never cached, so a switch turned off or a count put
 * right shows at the next read. Any failure reads as not offered.
 */
export async function backInStockOffer(
    productId: unknown,
    variantId: unknown,
): Promise<WatchResult<WatchOffer>> {
    if (!(await siteOrigin())) return WATCH_TROUBLE;
    const ids = watchIds(productId, variantId);
    if (!ids) return WATCH_TROUBLE;
    const siteId = await hostSiteId();
    if (!siteId) return WATCH_TROUBLE;
    const q = ids.variantId
        ? `?variantId=${encodeURIComponent(ids.variantId)}`
        : "";
    const call = await sitesFetch(
        `${encodeURIComponent(siteId)}/products/${encodeURIComponent(ids.productId)}/watch${q}`,
    );
    if (!call.ok) return WATCH_OFFLINE;
    return watchResultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWatchOffer,
    );
}

/**
 * "Tell me when it's back": the address, for the option chosen. The press
 * is the opt-in, with the consent line beside the button, so it is sent
 * as `consent: true`. Refused on a test release before anything is sent.
 */
export async function watchBackInStock(
    request: unknown,
): Promise<WatchResult<WatchTaken>> {
    if (!(await siteOrigin())) return WATCH_TROUBLE;
    if (await testMode()) return WATCH_TEST;
    const r =
        typeof request === "object" && request !== null
            ? (request as Record<string, unknown>)
            : {};
    const ids = watchIds(r.productId, r.variantId);
    if (!ids) return WATCH_TROUBLE;
    const email = cleanWatchEmail(r.email);
    if (!email) {
        return { ok: false, reason: "invalid", message: WATCH_WORDS.invalid };
    }
    const siteId = await hostSiteId();
    if (!siteId) return WATCH_TROUBLE;
    const body: Record<string, unknown> = { email, consent: true };
    if (ids.variantId) body.variantId = ids.variantId;
    const call = await sitesFetch(
        `${encodeURIComponent(siteId)}/products/${encodeURIComponent(ids.productId)}/watch`,
        { method: "POST", body },
    );
    if (!call.ok) return WATCH_OFFLINE;
    return watchResultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWatchTaken,
    );
}

/**
 * "Stop waiting", from the product page right after "Tell me" or from the
 * stop page (`/shop/stop-waiting/<token>`). A press, never a link that
 * stops on opening. Refused on a test release before anything is sent.
 */
export async function stopWaiting(
    token: unknown,
): Promise<WatchResult<WatchView>> {
    if (!(await siteOrigin())) return WATCH_TROUBLE;
    if (await testMode()) return WATCH_TEST;
    if (typeof token !== "string" || !WATCH_TOKEN.test(token)) {
        return WATCH_TROUBLE;
    }
    const siteId = await hostSiteId();
    if (!siteId) return WATCH_TROUBLE;
    const call = await sitesFetch(
        `${encodeURIComponent(siteId)}/stock-watch/${encodeURIComponent(token)}/stop`,
        { method: "POST" },
    );
    if (!call.ok) return WATCH_OFFLINE;
    return watchResultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWatchView,
    );
}
