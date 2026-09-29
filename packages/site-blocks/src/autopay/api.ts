import type { PaymentHandoff } from "../booking-flow/api";

/**
 * Autopay on a merchant's site (round-2 D12): the shapes the site's server
 * actions answer in, and the words for them. The blocks never call the API
 * themselves; the site's server does, and hands these in.
 */

/** How a customer can authorise autopay: only the kind, never a detail. */
export const AUTOPAY_METHODS = ["UPI", "CARD", "EMANDATE"] as const;
export type AutopayMethod = (typeof AUTOPAY_METHODS)[number];

export function isAutopayMethod(v: unknown): v is AutopayMethod {
    return (
        typeof v === "string" &&
        (AUTOPAY_METHODS as readonly string[]).includes(v)
    );
}

/** Just the methods from an answer, in its order, each once. */
export function autopayMethodsOf(v: unknown): AutopayMethod[] {
    if (!Array.isArray(v)) return [];
    const out: AutopayMethod[] = [];
    for (const m of v) if (isAutopayMethod(m) && !out.includes(m)) out.push(m);
    return out;
}

/** A started set-up: the provider's window to open, and where to land after. */
export interface AutopayStart {
    ref: string;
    method: AutopayMethod;
    /**
     * PAY_AND_AUTHORISE: this one window pays and turns autopay on (UPI,
     * card). AUTHORISE: it only authorises; nothing is taken now.
     */
    mode: "PAY_AND_AUTHORISE" | "AUTHORISE";
    limit: string;
    currency: string;
    handoff: PaymentHandoff;
    /** The provider's own page, when it has one instead of a window. */
    authorisationUrl: string | null;
    /** The page on the business's own site to land on after. */
    returnUrl: string | null;
}

/** How a plan's autopay stands. */
export interface AutopayState {
    state: "ON" | "PAUSED" | "PENDING" | "FAILED";
    method: AutopayMethod | null;
    hint: string | null;
}

/** What the page after set-up shows. */
export interface AutopayOutcome {
    plan: string;
    autopay: AutopayState | null;
    /** The payment went through (or, from the account, nothing is owed). */
    paid: boolean;
    nextPaymentAt: string | null;
    nextAmount: string | null;
    currency: string;
    timezone: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isNullableText = (v: unknown): v is string | null =>
    v === null || isText(v);

function isHandoff(v: unknown): v is PaymentHandoff {
    return (
        isRecord(v) &&
        isText(v.provider) &&
        typeof v.amountCents === "number" &&
        isText(v.currency) &&
        (v.providerIntentId == null || isText(v.providerIntentId)) &&
        (v.publicKey == null || isText(v.publicKey)) &&
        isRecord(v.clientParams)
    );
}

/** An API's start, checked; null when it isn't one. */
export function autopayStartOf(v: unknown): AutopayStart | null {
    if (
        !isRecord(v) ||
        !isText(v.ref) ||
        !isAutopayMethod(v.method) ||
        (v.mode !== "PAY_AND_AUTHORISE" && v.mode !== "AUTHORISE") ||
        !isText(v.limit) ||
        !isText(v.currency) ||
        !isHandoff(v.handoff) ||
        !isNullableText(v.authorisationUrl ?? null) ||
        !isNullableText(v.returnUrl ?? null)
    ) {
        return null;
    }
    return {
        ref: v.ref,
        method: v.method,
        mode: v.mode,
        limit: v.limit,
        currency: v.currency,
        handoff: {
            provider: v.handoff.provider,
            amountCents: v.handoff.amountCents,
            currency: v.handoff.currency,
            providerIntentId: v.handoff.providerIntentId ?? null,
            publicKey: v.handoff.publicKey ?? null,
            clientParams: v.handoff.clientParams,
        },
        authorisationUrl: (v.authorisationUrl as string | null) ?? null,
        returnUrl: (v.returnUrl as string | null) ?? null,
    };
}

/** An autopay state, checked; null when it isn't one. */
export function autopayStateOf(v: unknown): AutopayState | null {
    if (!isRecord(v)) return null;
    if (
        v.state !== "ON" &&
        v.state !== "PAUSED" &&
        v.state !== "PENDING" &&
        v.state !== "FAILED"
    ) {
        return null;
    }
    return {
        state: v.state,
        method: isAutopayMethod(v.method) ? v.method : null,
        hint: isText(v.hint) ? v.hint : null,
    };
}

/** An API's outcome, checked; only the fields the page shows. */
export function autopayOutcomeOf(v: unknown): AutopayOutcome | null {
    if (
        !isRecord(v) ||
        !isText(v.plan) ||
        typeof v.paid !== "boolean" ||
        !isNullableText(v.nextPaymentAt) ||
        !isNullableText(v.nextAmount) ||
        !isText(v.currency) ||
        !isText(v.timezone)
    ) {
        return null;
    }
    return {
        plan: v.plan,
        autopay: autopayStateOf(v.autopay),
        paid: v.paid,
        nextPaymentAt: v.nextPaymentAt,
        nextAmount: v.nextAmount,
        currency: v.currency,
        timezone: v.timezone,
    };
}
