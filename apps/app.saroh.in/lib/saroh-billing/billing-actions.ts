"use server";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { AddonsView, ChangeQuote, ChangeResult, Cycle } from "./plan-view";

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
        d.kind === "TRIAL"
    ) {
        return {
            ok: true,
            data: {
                kind: d.kind,
                authorisationUrl: securePage(d.authorisationUrl),
            },
        };
    }
    return { ok: false, error: CHANGE_FAILED };
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
