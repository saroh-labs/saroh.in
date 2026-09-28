"use server";

import type { PayNowResult, PlanChangeResult } from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import { payNowAnswer, planChangeAnswer } from "@/lib/account-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";

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
    if (!PAUSE_WEEKS.includes(weeks)) {
        return { ok: false, message: "Pause for 2, 4 or 8 weeks" };
    }
    return change(ref, "pause", { weeks });
}

export async function resumePlan(ref: string): Promise<PlanChangeResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    return change(ref, "resume");
}

export async function cancelPlan(ref: string): Promise<PlanChangeResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    return change(ref, "cancel");
}

export async function payPlanNow(ref: string): Promise<PayNowResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
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
