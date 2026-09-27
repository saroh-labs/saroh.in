import type {
    CodeRequestResult,
    SignedInCustomer,
    SignInOptions,
    VerifyResult,
} from "@saroh/site-blocks";

import { siteAccountsFetch } from "./customer-session";

/**
 * What the API's sign-in answers mean for the sheet (ADR-011; round-2 plan
 * A, A2/A3). Pure, so each answer is tested: the sheet speaks in its own
 * sentences, and the API's text never reaches a customer.
 *
 *   GET  public/site-accounts/options   → the challenge and the phone
 *   POST public/site-accounts/codes     → 202 · 429 limit|wait · 400 challenge · 503 unavailable
 *   POST public/site-accounts/sessions  → 201 token · 400 invalid|expired · 409 merged · 403 blocked
 */

interface ApiError {
    details?: Record<string, unknown>;
}

function detailsOf(body: unknown): Record<string, unknown> {
    const details = (body as ApiError | null)?.details;
    return details && typeof details === "object" ? details : {};
}

function seconds(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.ceil(value)
        : fallback;
}

export function codeResult(status: number, body: unknown): CodeRequestResult {
    const details = detailsOf(body);
    if (status === 202) {
        const resend = (body as { resendAfterSeconds?: unknown } | null)
            ?.resendAfterSeconds;
        return { ok: true, resendAfterSeconds: seconds(resend, 30) };
    }
    if (status === 429) {
        return {
            ok: false,
            reason: details.reason === "wait" ? "wait" : "limit",
            retryAfterSeconds: seconds(details.retryAfter, 60),
        };
    }
    if (status === 400 && details.reason === "challenge") {
        return {
            ok: false,
            reason: "challenge",
            siteKey:
                typeof details.siteKey === "string" ? details.siteKey : null,
        };
    }
    if (status === 400) return { ok: false, reason: "email" };
    if (status === 503) return { ok: false, reason: "unavailable" };
    if (status === 403) return { ok: false, reason: "closed" };
    return { ok: false, reason: "error" };
}

/** A new session's token, or why there isn't one. */
export type SessionAnswer =
    | { ok: true; token: string; expiresAt: Date }
    | Exclude<VerifyResult, { ok: true }>;

export function sessionAnswer(status: number, body: unknown): SessionAnswer {
    const details = detailsOf(body);
    if (status === 201) {
        const b = (body ?? {}) as { token?: unknown; expiresAt?: unknown };
        const expiresAt =
            typeof b.expiresAt === "string" ? new Date(b.expiresAt) : null;
        if (
            typeof b.token === "string" &&
            b.token &&
            expiresAt &&
            !Number.isNaN(expiresAt.getTime())
        ) {
            return { ok: true, token: b.token, expiresAt };
        }
        return { ok: false, reason: "error" };
    }
    if (status === 400) {
        return {
            ok: false,
            reason: details.reason === "invalid" ? "invalid" : "expired",
        };
    }
    if (status === 409 && typeof details.signsInAs === "string") {
        return { ok: false, reason: "merged", signsInAs: details.signsInAs };
    }
    if (status === 403) return { ok: false, reason: "blocked" };
    if (status === 429) {
        return {
            ok: false,
            reason: "limit",
            retryAfterSeconds: seconds(details.retryAfter, 60),
        };
    }
    return { ok: false, reason: "error" };
}

export function optionsResult(body: unknown): SignInOptions | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const challenge = b.challenge as Record<string, unknown> | undefined;
    if (typeof b.businessName !== "string" || !challenge) return null;
    return {
        businessName: b.businessName,
        phone: typeof b.phone === "string" && b.phone.trim() ? b.phone : null,
        challenge: {
            required: challenge.required === true,
            siteKey:
                typeof challenge.siteKey === "string"
                    ? challenge.siteKey
                    : null,
        },
    };
}

/**
 * What the sheet needs up front, for the site this request is on. Null when
 * the API can't say; the booking page then offers sign-in without a phone
 * line and learns about a challenge from the first answer.
 */
export async function getSignInOptions(): Promise<SignInOptions | null> {
    const call = await siteAccountsFetch("options");
    if (!call.ok || !call.res.ok) return null;
    return optionsResult(await call.res.json().catch(() => null));
}

/** Fallback when the customer can't be read back right after signing in. */
export function customerFromEmail(email: string): SignedInCustomer {
    return { email: email.trim().toLowerCase(), name: null };
}
