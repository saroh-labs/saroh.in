import type {
    JoinResult,
    PlanJoinAttempt,
    PlanJoinStarted,
} from "@saroh/site-blocks";

/**
 * Joining a plan from the site (round-2 G20): the API's answers narrowed,
 * and every refusal turned into the customer's words. Kept apart from the
 * actions, which read the app's env, so they can be tested without one.
 *
 * Only the API's sentences written for the customer are passed on — "ask
 * them about joining", "you're already on it" and the fourth open join
 * (409), and the account's own "too many tries" (429). The rest are the
 * page's own. A 401 is a session that ended: the page signs in again.
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null =>
    v === null || isString(v);

export const JOIN_TROUBLE =
    "We couldn't start the payment. Try again in a moment.";

function isStarted(v: unknown): v is PlanJoinStarted {
    if (!isRecord(v) || !isRecord(v.plan) || !isRecord(v.payment)) {
        return false;
    }
    const p = v.payment;
    return (
        isString(v.ref) &&
        isString(v.plan.name) &&
        isString(v.plan.interval) &&
        isString(v.total) &&
        isString(v.currency) &&
        isString(p.provider) &&
        typeof p.amountCents === "number" &&
        isString(p.currency) &&
        isStringOrNull(p.providerIntentId) &&
        isStringOrNull(p.publicKey) &&
        isRecord(p.clientParams)
    );
}

const STATES = new Set(["paying", "joined", "closed"]);

function isAttempt(v: unknown): v is PlanJoinAttempt {
    return (
        isRecord(v) &&
        isString(v.state) &&
        STATES.has(v.state) &&
        isRecord(v.plan) &&
        isString(v.plan.name)
    );
}

/** What starting to join answered: the payment to open, or why not. */
export function joinStartAnswer(
    status: number,
    body: unknown,
): JoinResult<PlanJoinStarted> {
    if (status >= 200 && status < 300) {
        return isStarted(body)
            ? {
                  ok: true,
                  // Only what the sheet needs: never the API's intent id.
                  data: {
                      ref: body.ref,
                      plan: body.plan,
                      total: body.total,
                      currency: body.currency,
                      payment: {
                          provider: body.payment.provider,
                          amountCents: body.payment.amountCents,
                          currency: body.payment.currency,
                          providerIntentId: body.payment.providerIntentId,
                          publicKey: body.payment.publicKey,
                          clientParams: body.payment.clientParams,
                      },
                  },
              }
            : { ok: false, reason: "error", message: JOIN_TROUBLE };
    }
    if (status === 401) {
        return {
            ok: false,
            reason: "signed-out",
            message: "Sign in again to join.",
        };
    }
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message =
        isString(error?.message) && error.message.trim() ? error.message : null;
    const details = isRecord(error?.details) ? error.details : null;
    if (status === 409 && message) {
        return {
            ok: false,
            reason: details?.reason === "ask" ? "ask" : "error",
            message,
        };
    }
    if (status === 429 && message) {
        return { ok: false, reason: "error", message };
    }
    if (status === 404) {
        return {
            ok: false,
            reason: "error",
            message: "That plan isn't on offer any more. Refresh the page.",
        };
    }
    return { ok: false, reason: "error", message: JOIN_TROUBLE };
}

/** How a started join stands, or why it can't be said. */
export function joinStandingAnswer(
    status: number,
    body: unknown,
): JoinResult<PlanJoinAttempt> {
    if (status >= 200 && status < 300 && isAttempt(body)) {
        return { ok: true, data: body };
    }
    if (status === 401) {
        return {
            ok: false,
            reason: "signed-out",
            message: "Sign in again to see your plan.",
        };
    }
    return {
        ok: false,
        reason: "error",
        message:
            status === 404
                ? "That payment isn't on your account."
                : "We couldn't check the payment. Try again in a moment.",
    };
}
