"use server";

import { apiFetch, orgBase, readError } from "@/lib/api/http";

import { INVITE_TOKEN, LAUNCH_OFFER_FAILED } from "./launch-offer";
import type {
    ApiAnswer,
    ChangeAnswer,
    PlanCheckoutInput,
    PlanCheckoutResult,
    QuoteAnswer,
} from "./plan-checkout";
import {
    CHECKOUT_FAILED,
    checkoutInput,
    startPlanCheckout,
} from "./plan-checkout";

async function call<T>(
    path: string,
    init?: RequestInit,
): Promise<ApiAnswer<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, status: 0, error: CHECKOUT_FAILED };
    const res = await apiFetch(`${base}${path}`, init);
    const data = (await res.json().catch(() => null)) as
        (T & { message?: string }) | null;
    if (res.ok && data) return { ok: true, data };
    return {
        ok: false,
        status: res.status,
        error: readError(data, CHECKOUT_FAILED),
    };
}

/**
 * The paid plan picked on saroh.in, started for the business onboarding has
 * just made and made active (plan U27). Needs `billing:manage`, which its
 * Owner has. See `./plan-checkout.ts` for what each answer means.
 */
export async function startCheckoutAfterOnboarding(
    intent: unknown,
): Promise<PlanCheckoutResult> {
    const input = checkoutInput(intent);
    if (!input) return { kind: "failed", error: CHECKOUT_FAILED };
    return startPlanCheckout(input, {
        quote: ({ plan, cycle }: PlanCheckoutInput) =>
            call<QuoteAnswer>(
                `/billing/change-plan?${new URLSearchParams({ plan, cycle }).toString()}`,
            ),
        change: (body: PlanCheckoutInput) =>
            call<ChangeAnswer>("/billing/change-plan", {
                method: "POST",
                body: JSON.stringify(body),
            }),
    });
}

/**
 * The launch offer an opening-day invite carries (plan U31), taken for the
 * business onboarding has just made and made active: the API checks the
 * invite against this account's address, marks the waitlist entry joined
 * and puts the business on the offer plan. Needs `billing:manage`, which
 * its Owner has.
 */
export async function takeLaunchOfferAfterOnboarding(
    token: unknown,
): Promise<{ ok: true; until: string } | { ok: false; error: string }> {
    if (typeof token !== "string" || !INVITE_TOKEN.test(token)) {
        return { ok: false, error: LAUNCH_OFFER_FAILED };
    }
    const base = await orgBase();
    if (!base) return { ok: false, error: LAUNCH_OFFER_FAILED };
    const res = await apiFetch(`${base}/launch-offer`, {
        method: "POST",
        body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => null)) as {
        until?: string;
        message?: string;
    } | null;
    if (res.ok && typeof data?.until === "string") {
        return { ok: true, until: data.until };
    }
    return {
        ok: false,
        error:
            res.status >= 500
                ? LAUNCH_OFFER_FAILED
                : readError(data, LAUNCH_OFFER_FAILED),
    };
}
