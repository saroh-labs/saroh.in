"use server";

import type {
    AccountPackAttempt,
    AccountPackCheckout,
    AutopayMethod,
    AutopayStart,
    AutopayStartResult,
    JoinResult,
    PackResult,
    PayNowResult,
    PlanChangeResult,
    PlanJoinAttempt,
    PlanJoinStarted,
} from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import {
    packAttemptAnswer,
    packCheckoutAnswer,
} from "@/lib/account-packs-shape";
import { payNowAnswer, planChangeAnswer } from "@/lib/account-shape";
import { AUTOPAY_METHOD, autopayStartAnswer } from "@/lib/autopay-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { joinStandingAnswer, joinStartAnswer } from "@/lib/plan-join-shape";
import { testMode } from "@/lib/test-release";
import { TEST_RELEASE_REFUSAL } from "@saroh/site-blocks";

/**
 * What a member does to their own plan from the account's Plan tab (round-2
 * plan A, A8): pause for 2, 4 or 8 weeks, resume, cancel at the period's
 * end, and "Pay now". Each runs on this server with the session cookie and
 * the signed relay, and checks `Origin` first (`lib/origin.test.ts` fails
 * when one doesn't). The API finds the plan by its ref **and** the
 * signed-in member, so a ref is only ever theirs.
 */

const OFFLINE = "We couldn't reach the business. Try again in a moment.";
const PAUSE_WEEKS = [2, 4, 8];
/** A subscription's ref is an opaque id: letters, digits, `_` and `-`. */
const REF = /^[A-Za-z0-9_-]{1,64}$/;

/** Called only after the action has checked `Origin`. */
async function change(
    ref: string,
    action: "pause" | "resume" | "cancel",
    body?: unknown,
): Promise<PlanChangeResult> {
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof ref !== "string" || !REF.test(ref)) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/plan/${ref}/${action}`, {
        method: "POST",
        body: body ?? {},
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    return planChangeAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
        OFFLINE,
    );
}

export async function pausePlan(
    ref: string,
    weeks: number,
): Promise<PlanChangeResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!PAUSE_WEEKS.includes(weeks)) {
        return { ok: false, message: "Pause for 2, 4 or 8 weeks" };
    }
    return change(ref, "pause", { weeks });
}

export async function resumePlan(ref: string): Promise<PlanChangeResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    return change(ref, "resume");
}

export async function cancelPlan(ref: string): Promise<PlanChangeResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    return change(ref, "cancel");
}

export async function payPlanNow(ref: string): Promise<PayNowResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof ref !== "string" || !REF.test(ref)) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/plan/${ref}/pay`, {
        method: "POST",
        body: {},
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    return payNowAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
        OFFLINE,
    );
}

// ---- Buying a class pack (A11) --------------------------------------------

/** An idempotency key from the page: a short token, never anything else. */
const KEY = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Start paying for a pack: the API makes the payment from the pack's own
 * price, and answers with the provider's handoff. Only the pack's ref and
 * the page's idempotency key travel on — never an amount.
 */
export async function buyPack(
    ref: string,
    idempotencyKey: string,
): Promise<PackResult<AccountPackCheckout>> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof ref !== "string" || !REF.test(ref)) {
        return { ok: false, message: OFFLINE };
    }
    if (typeof idempotencyKey !== "string" || !KEY.test(idempotencyKey)) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/packs/${ref}/buy`, {
        method: "POST",
        body: { idempotencyKey },
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    return packCheckoutAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}

/** How a started pack payment stands: paying, bought or closed. */
export async function packPayment(
    ref: string,
): Promise<PackResult<AccountPackAttempt>> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof ref !== "string" || !REF.test(ref)) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/packs/payments/${ref}`);
    if (!call?.ok) return { ok: false, message: OFFLINE };
    return packAttemptAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}

// ---- Joining a plan from the site's Prices page (G20) ---------------------

const OFFLINE_JOIN: JoinResult<never> = {
    ok: false,
    reason: "error",
    message: OFFLINE,
};

const SIGNED_OUT: JoinResult<never> = {
    ok: false,
    reason: "signed-out",
    message: "Sign in again to join.",
};

/**
 * Start paying to join a plan: the API makes the payment from the plan's
 * own price, and answers with the provider's handoff. Only the plan's ref,
 * the page's idempotency key and, with autopay (D12), the method picked
 * from the provider's own list travel on — never an amount (DEC-059).
 */
export async function joinPlan(
    ref: string,
    idempotencyKey: string,
    autopay?: AutopayMethod,
): Promise<JoinResult<PlanJoinStarted>> {
    if (!(await siteOrigin())) return OFFLINE_JOIN;
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return OFFLINE_JOIN;
    if (typeof ref !== "string" || !REF.test(ref)) return OFFLINE_JOIN;
    if (typeof idempotencyKey !== "string" || !KEY.test(idempotencyKey)) {
        return OFFLINE_JOIN;
    }
    if (
        autopay !== undefined &&
        (typeof autopay !== "string" || !AUTOPAY_METHOD.test(autopay))
    ) {
        return OFFLINE_JOIN;
    }
    const call = await accountFetch(`me/plans/${ref}/join`, {
        method: "POST",
        body: autopay ? { idempotencyKey, autopay } : { idempotencyKey },
    });
    if (call === null) return SIGNED_OUT;
    if (!call.ok) return OFFLINE_JOIN;
    return joinStartAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}

/** How a started join stands: paying, joined or closed. */
export async function planJoinStanding(
    ref: string,
): Promise<JoinResult<PlanJoinAttempt>> {
    if (!(await siteOrigin())) return OFFLINE_JOIN;
    if (!accountAreaOn()) return OFFLINE_JOIN;
    if (typeof ref !== "string" || !REF.test(ref)) return OFFLINE_JOIN;
    const call = await accountFetch(`me/plans/joins/${ref}`);
    if (call === null) return SIGNED_OUT;
    if (!call.ok) return OFFLINE_JOIN;
    return joinStandingAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}

// ---- Autopay (D12) ----------------------------------------------------------

/**
 * Turn autopay on for a plan of theirs, or change how it pays: "Set up
 * autopay" on My plan, and the join's eMandate step. Only the plan's ref,
 * the method picked from the provider's own list and a key travel on; the
 * API sets the amount and the limit, and finds the plan by the signed-in
 * member, so a ref is only ever theirs.
 */
export async function startPlanAutopay(
    ref: string,
    method: AutopayMethod,
    idempotencyKey: string,
): Promise<AutopayStartResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (
        typeof ref !== "string" ||
        !REF.test(ref) ||
        typeof method !== "string" ||
        !AUTOPAY_METHOD.test(method) ||
        typeof idempotencyKey !== "string" ||
        !KEY.test(idempotencyKey)
    ) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/autopay/plans/${ref}`, {
        method: "POST",
        body: { method, idempotencyKey },
    });
    if (call === null) {
        return { ok: false, message: "Sign in again to set up autopay." };
    }
    if (!call.ok) return { ok: false, message: OFFLINE };
    return autopayStartAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}

/** The join's eMandate step, in the join sheet's answer shape. */
export async function joinStartAutopay(
    subscriptionRef: string,
    method: AutopayMethod,
    idempotencyKey: string,
): Promise<JoinResult<AutopayStart>> {
    if (!(await siteOrigin())) return OFFLINE_JOIN;
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    const result = await startPlanAutopay(
        subscriptionRef,
        method,
        idempotencyKey,
    );
    return result.ok
        ? result
        : { ok: false, reason: "error", message: result.message };
}
