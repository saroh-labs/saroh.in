"use server";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import { cleanHandoff } from "./handoff";
import type {
    AddonsView,
    ChangeQuote,
    ChangeResult,
    ConfirmResult,
    Cycle,
} from "./plan-view";

/**
 * Settings › Plan and billing's writes (plans catalogue U15–U17): quote a
 * change, make it, hold add-ons. Only keys go to the API — a plan id, a
 * cycle, a coupon code, the bill-to state and GSTIN, an add-on and how many;
 * every amount is the server's (KTD-18). Actions take any input, so each
 * is checked again here.
 */

const PLAN_ID = /^[a-z][a-z0-9-]{0,39}$/;
const ADDON_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COUPON = /^[A-Za-z0-9_-]{1,32}$/;
const GSTIN = /^[0-9A-Z]{15}$/;

const QUOTE_FAILED =
    "The price for that plan couldn't be worked out. Try again.";
const CHANGE_FAILED =
    "The plan couldn't be changed just now. Nothing was charged. Try again.";
const ADDON_FAILED =
    "The add-on couldn't be changed. Nothing was charged. Try again.";

export interface ChangeInput {
    plan: string;
    cycle: Cycle;
    coupon?: string;
    billingState?: string;
    gstin?: string;
}

function clean(input: unknown): ChangeInput | null {
    if (!input || typeof input !== "object") return null;
    const { plan, cycle, coupon, billingState, gstin } = input as Record<
        string,
        unknown
    >;
    if (typeof plan !== "string" || !PLAN_ID.test(plan)) return null;
    if (cycle !== "month" && cycle !== "year") return null;
    const out: ChangeInput = { plan, cycle };
    if (typeof coupon === "string" && coupon.trim()) {
        out.coupon = coupon.trim().toUpperCase();
    }
    if (typeof billingState === "string" && billingState.trim()) {
        out.billingState = billingState.trim().slice(0, 64);
    }
    if (typeof gstin === "string" && gstin.trim()) {
        out.gstin = gstin.trim().toUpperCase();
    }
    return out;
}

async function send<T>(
    path: string,
    fallback: string,
    init?: RequestInit,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: fallback };
    const res = await apiFetch(`${base}${path}`, init);
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && body) return { ok: true, data: body as T };
    // A server failure's words are generic: say ours instead.
    return toFailure(res.status >= 500 ? null : body, fallback);
}

/** What moving to a plan would be and cost; a coupon refused names `coupon`. */
export async function quoteChangeAction(
    input: unknown,
): Promise<ApiResult<ChangeQuote>> {
    const c = clean(input);
    if (!c) return { ok: false, error: QUOTE_FAILED };
    if (c.coupon && !COUPON.test(c.coupon)) {
        return {
            ok: false,
            error: "That isn't a coupon code.",
            field: "coupon",
        };
    }
    const q = new URLSearchParams({ plan: c.plan, cycle: c.cycle });
    if (c.coupon) q.set("coupon", c.coupon);
    return send<ChangeQuote>(
        `/billing/change-plan?${q.toString()}`,
        QUOTE_FAILED,
    );
}

/** Only ever a secure page: the address comes back from a provider. */
function securePage(url: unknown): string | null {
    if (typeof url !== "string" || !url) return null;
    try {
        return new URL(url).protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

/**
 * Change plan: to Free (no checkout), or a checkout whose payment page the
 * browser goes to next. That page's link is given once and kept nowhere.
 */
export async function changePlanAction(
    input: unknown,
): Promise<ApiResult<ChangeResult>> {
    const c = clean(input);
    if (!c) return { ok: false, error: CHANGE_FAILED };
    if (c.coupon && !COUPON.test(c.coupon)) {
        return {
            ok: false,
            error: "That isn't a coupon code.",
            field: "coupon",
        };
    }
    if (c.gstin && !GSTIN.test(c.gstin)) {
        return {
            ok: false,
            error: "A GSTIN is 15 characters.",
            field: "gstin",
        };
    }
    const res = await send<{
        kind: string;
        effectiveAt?: string;
        authorisationUrl?: string | null;
        handoff?: unknown;
    }>("/billing/change-plan", CHANGE_FAILED, {
        method: "POST",
        body: JSON.stringify(c),
    });
    if (!res.ok) return res;
    const d = res.data;
    if (d.kind === "TO_FREE" && typeof d.effectiveAt === "string") {
        return {
            ok: true,
            data: { kind: "TO_FREE", effectiveAt: d.effectiveAt },
        };
    }
    if (
        d.kind === "NEW" ||
        d.kind === "UPGRADE" ||
        d.kind === "SCHEDULED" ||
        d.kind === "TRIAL" ||
        d.kind === "RENEW"
    ) {
        return {
            ok: true,
            data: {
                kind: d.kind,
                authorisationUrl: securePage(d.authorisationUrl),
                handoff: cleanHandoff(d.handoff),
            },
        };
    }
    return { ok: false, error: CHANGE_FAILED };
}

const CONFIRM_STATES = new Set([
    "completed",
    "scheduled",
    "waiting",
    "failed",
    "none",
]);

/**
 * Back from paying (DEC-093): ask the API to check the waiting checkout
 * with Razorpay and move the plan if it's paid. Safe to ask again; a
 * failure to ask reads as still waiting, never as a reason to pay again.
 */
export async function confirmCheckoutAction(): Promise<
    ApiResult<ConfirmResult>
> {
    const res = await send<ConfirmResult>(
        "/billing/checkout/confirm",
        "We couldn't check your payment just now. If you've paid, you don't need to pay again.",
        { method: "POST" },
    );
    if (!res.ok) return res;
    const d = res.data;
    if (!CONFIRM_STATES.has(d.state)) {
        return {
            ok: true,
            data: { state: "waiting", plan: null, startAt: null },
        };
    }
    return { ok: true, data: d };
}

/** What a coupon checked on Apply comes to (UX-046). */
export interface CouponCheck {
    code: string;
    planName: string;
    discountPaise: number;
    charges: number;
    cycle: Cycle;
}

/**
 * Check a coupon when it's applied (UX-046), against the plans it could be
 * used with — the paid plans the picker offers on this cycle, in order —
 * through the same quote that will price it. The first plan it works on
 * answers; if none, the API's own reason for the first.
 */
export async function checkCouponAction(
    input: unknown,
): Promise<ApiResult<CouponCheck>> {
    const { code, cycle, plans } = (input ?? {}) as Record<string, unknown>;
    const c = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!COUPON.test(c)) {
        return { ok: false, error: "That code isn't valid.", field: "coupon" };
    }
    if (cycle !== "month" && cycle !== "year") {
        return { ok: false, error: QUOTE_FAILED };
    }
    const ids = Array.isArray(plans)
        ? plans
              .filter(
                  (p): p is string => typeof p === "string" && PLAN_ID.test(p),
              )
              .slice(0, 4)
        : [];
    if (ids.length === 0) {
        return {
            ok: false,
            error: "A coupon is used when you start a paid plan, and there's none to start here.",
            field: "coupon",
        };
    }
    let first: ApiResult<CouponCheck> | null = null;
    for (const plan of ids) {
        const res = await quoteChangeAction({ plan, cycle, coupon: c });
        if (res.ok && res.data.coupon) {
            return {
                ok: true,
                data: {
                    code: res.data.coupon.code,
                    planName: res.data.plan.name,
                    discountPaise: res.data.coupon.discountPaise,
                    charges: res.data.coupon.charges,
                    cycle,
                },
            };
        }
        if (!res.ok && res.field !== "coupon") return res;
        first ??= res.ok
            ? {
                  ok: false,
                  error: `${c} can't be used with ${res.data.plan.name}.`,
                  field: "coupon",
              }
            : res;
    }
    return first ?? { ok: false, error: QUOTE_FAILED };
}

/** Hold this many of an add-on; zero removes it. */
export async function setAddonAction(
    addonId: unknown,
    quantity: unknown,
): Promise<ApiResult<AddonsView>> {
    if (typeof addonId !== "string" || !ADDON_ID.test(addonId)) {
        return { ok: false, error: ADDON_FAILED };
    }
    if (
        typeof quantity !== "number" ||
        !Number.isSafeInteger(quantity) ||
        quantity < 0
    ) {
        return { ok: false, error: ADDON_FAILED };
    }
    return send<AddonsView>(
        `/billing/addons/${encodeURIComponent(addonId)}`,
        ADDON_FAILED,
        { method: "PUT", body: JSON.stringify({ quantity }) },
    );
}
