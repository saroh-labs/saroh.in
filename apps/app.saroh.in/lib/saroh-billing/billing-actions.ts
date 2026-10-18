"use server";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type {
    BusinessBillingProfile,
    OwnBillingProfile,
    ProfileEdit,
} from "@/lib/billing-profiles/view";

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
 * cycle, a coupon code, the bill-to state, GSTIN and registered address
 * (and a name, email or phone the business had none of), an add-on and
 * how many;
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

/** The registered address asked for at checkout (Rule 46(e)). */
export interface AddressInput {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
}

export interface ChangeInput {
    plan: string;
    cycle: Cycle;
    coupon?: string;
    billingState?: string;
    gstin?: string;
    registeredAddress?: AddressInput;
    /** Asked only when the business has none (17 Oct 2026). */
    billingName?: string;
    billingEmail?: string;
    phone?: string;
}

/** The typed words of a field, trimmed and capped; blank is none. */
function text(value: unknown, max: number): string | undefined {
    return typeof value === "string" && value.trim()
        ? value.trim().slice(0, max)
        : undefined;
}

const ADDRESS_LIMITS: Record<keyof AddressInput, number> = {
    line1: 120,
    line2: 120,
    city: 60,
    postalCode: 12,
};

/** The address's typed lines, trimmed; none typed is no address. */
function cleanAddress(value: unknown): AddressInput | undefined {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    const out: AddressInput = {};
    for (const key of Object.keys(ADDRESS_LIMITS) as (keyof AddressInput)[]) {
        const v = raw[key];
        if (typeof v === "string" && v.trim()) {
            out[key] = v.trim().slice(0, ADDRESS_LIMITS[key]);
        }
    }
    return Object.keys(out).length ? out : undefined;
}

function clean(input: unknown): ChangeInput | null {
    if (!input || typeof input !== "object") return null;
    const {
        plan,
        cycle,
        coupon,
        billingState,
        gstin,
        registeredAddress,
        billingName,
        billingEmail,
        phone,
    } = input as Record<string, unknown>;
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
    const address = cleanAddress(registeredAddress);
    if (address) out.registeredAddress = address;
    const name = text(billingName, 200);
    if (name) out.billingName = name;
    const email = text(billingEmail, 254);
    if (email) out.billingEmail = email;
    const tel = text(phone, 32);
    if (tel) out.phone = tel;
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

// ── Who Saroh bills (DEC-167, U5) ───────────────────────────────────────

const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PROFILE_READ_FAILED =
    "Your billing profiles couldn't be loaded. Try again.";
const PROFILE_FAILED =
    "Who Saroh bills couldn't be changed just now. Nothing was changed. Try again.";

/** The profile's fields an action passes on, trimmed and capped. */
const PROFILE_LIMITS: Record<keyof ProfileEdit, number> = {
    legalName: 200,
    billingEmail: 254,
    gstin: 15,
    gstState: 60,
    addressLine1: 120,
    city: 60,
    postalCode: 12,
};

/** What a profile's save sends: each field a string, "" to clear one. */
function cleanProfile(input: unknown): ProfileEdit {
    const raw =
        input && typeof input === "object"
            ? (input as Record<string, unknown>)
            : {};
    const out: ProfileEdit = {};
    for (const key of Object.keys(PROFILE_LIMITS) as (keyof ProfileEdit)[]) {
        const v = raw[key];
        if (typeof v === "string") {
            out[key] = v.trim().slice(0, PROFILE_LIMITS[key]);
        }
    }
    return out;
}

/** Who Saroh bills, read for a sheet opened away from Plan & billing. */
export async function billingProfileViewAction(): Promise<
    ApiResult<BusinessBillingProfile>
> {
    return send<BusinessBillingProfile>(
        "/billing/profile",
        PROFILE_READ_FAILED,
    );
}

/** Bill the business to one of the owner's profiles. */
export async function chooseBillingProfileAction(
    billingProfileId: unknown,
): Promise<ApiResult<BusinessBillingProfile>> {
    if (
        typeof billingProfileId !== "string" ||
        !PROFILE_ID.test(billingProfileId)
    ) {
        return { ok: false, error: PROFILE_FAILED, field: "billingProfile" };
    }
    return send<BusinessBillingProfile>(
        "/billing/profile/choose",
        PROFILE_FAILED,
        { method: "POST", body: JSON.stringify({ billingProfileId }) },
    );
}

/** A new profile for the owner, and (`use`) the business's from now. */
export async function createBillingProfileAction(
    input: unknown,
    use: unknown,
): Promise<ApiResult<BusinessBillingProfile & { created: string }>> {
    const profile = cleanProfile(input);
    return send<BusinessBillingProfile & { created: string }>(
        "/billing/profile",
        PROFILE_FAILED,
        {
            method: "POST",
            body: JSON.stringify({
                legalName: profile.legalName ?? "",
                billingEmail: profile.billingEmail ?? "",
                ...Object.fromEntries(
                    Object.entries(profile).filter(([, v]) => v !== ""),
                ),
                use: use === true,
            }),
        },
    );
}

/** Change one of the owner's profiles; says how many businesses it bills. */
export async function updateBillingProfileAction(
    billingProfileId: unknown,
    input: unknown,
): Promise<ApiResult<{ profile: OwnBillingProfile; businesses: number }>> {
    if (
        typeof billingProfileId !== "string" ||
        !PROFILE_ID.test(billingProfileId)
    ) {
        return { ok: false, error: PROFILE_FAILED };
    }
    return send<{ profile: OwnBillingProfile; businesses: number }>(
        `/billing/profile/${encodeURIComponent(billingProfileId)}`,
        PROFILE_FAILED,
        { method: "PATCH", body: JSON.stringify(cleanProfile(input)) },
    );
}
