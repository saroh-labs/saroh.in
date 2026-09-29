import type {
    AutopayDoneState,
    AutopayStart,
    AutopayStartResult,
} from "@saroh/site-blocks";
import { autopayOutcomeOf, autopayStartOf } from "@saroh/site-blocks";

/**
 * Autopay on the business's site (round-2 D12): the API's answers narrowed,
 * and every refusal turned into the customer's words. Kept apart from the
 * actions, which read the app's env, so they can be tested without one.
 *
 * Only the API's own sentences written for the customer pass through (a
 * 409's "Autopay isn't available…", "That way to pay isn't…", a 429's
 * "Too many tries…"); the rest are the page's own.
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";

export const AUTOPAY_TROUBLE =
    "We couldn't start autopay. Try again in a moment.";

/** A method from the page: one of the three kinds, nothing else. */
export const AUTOPAY_METHOD = /^(UPI|CARD|EMANDATE)$/;

function apiMessage(body: unknown): string | null {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    return isString(error?.message) && error.message.trim()
        ? error.message
        : null;
}

/** What starting autopay answered: the window to open, or why not. */
export function autopayStartAnswer(
    status: number,
    body: unknown,
): AutopayStartResult {
    if (status >= 200 && status < 300) {
        const start: AutopayStart | null = autopayStartOf(body);
        return start
            ? { ok: true, data: start }
            : { ok: false, message: AUTOPAY_TROUBLE };
    }
    if (status === 401) {
        return { ok: false, message: "Sign in again to set up autopay." };
    }
    const message = apiMessage(body);
    if ((status === 409 || status === 429) && message) {
        return { ok: false, message };
    }
    if (status === 404) {
        return {
            ok: false,
            message: "That plan isn't on your account. Refresh the page.",
        };
    }
    return { ok: false, message: AUTOPAY_TROUBLE };
}

/** How autopay stands, for the page after: an outcome or what went wrong. */
export function autopayDoneAnswer(
    status: number,
    body: unknown,
): AutopayDoneState {
    if (status === 401) return { kind: "signed-out" };
    if (status < 200 || status >= 300) return { kind: "error" };
    const outcome = autopayOutcomeOf(body);
    return outcome ? { kind: "outcome", outcome } : { kind: "error" };
}

/** A join's autopay (the Prices page): paying, joined or closed. */
export function joinDoneAnswer(
    status: number,
    body: unknown,
): AutopayDoneState {
    if (status === 401) return { kind: "signed-out" };
    if (status < 200 || status >= 300 || !isRecord(body)) {
        return { kind: "error" };
    }
    if (body.state === "paying") return { kind: "joining" };
    if (body.state === "closed" && isString(body.plan)) {
        return { kind: "closed", plan: body.plan };
    }
    const outcome = autopayOutcomeOf(body.outcome);
    return body.state === "joined" && outcome
        ? { kind: "outcome", outcome }
        : { kind: "error" };
}

/** A ref or a token from the address: letters, digits, `_` and `-`. */
export const AUTOPAY_REF = /^[A-Za-z0-9_-]{1,128}$/;

/** Which set-up the page is about, from its address. */
export type AutopayRead =
    | { kind: "pay"; token: string }
    | { kind: "plan"; ref: string }
    | { kind: "join"; ref: string };

/** The page's address as a read; null when it names none. */
export function autopayReadOf(params: {
    pay?: string | string[];
    plan?: string | string[];
    join?: string | string[];
}): AutopayRead | null {
    const one = (v: string | string[] | undefined) =>
        typeof v === "string" && AUTOPAY_REF.test(v) ? v : null;
    const pay = one(params.pay);
    if (pay) return { kind: "pay", token: pay };
    const plan = one(params.plan);
    if (plan) return { kind: "plan", ref: plan };
    const join = one(params.join);
    if (join) return { kind: "join", ref: join };
    return null;
}
