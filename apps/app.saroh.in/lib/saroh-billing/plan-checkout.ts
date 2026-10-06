import type { PlanIntent } from "@saroh/pricing-catalog";

/**
 * The checkout a new business goes on to when its owner picked a paid plan
 * on saroh.in (plan U27), after onboarding has made the business. Pure: the
 * two calls to api.saroh.in are passed in, so the decisions are testable
 * (`./checkout-actions.ts` wires them).
 *
 * Quote first (`GET …/billing/change-plan?plan=&cycle=`): the API is the
 * last word on whether the plan can be bought, and a quote that says there
 * is nothing to buy (already on it, or a free plan) ends here. Then the
 * change (`POST …/billing/change-plan {plan, cycle}`), whose
 * `authorisationUrl` is where the owner authorises the payment. It is given
 * once and kept nowhere, so it goes straight to the browser.
 *
 * Every amount is the server's (KTD-18): only the plan id and the cycle are
 * ever sent.
 */

export type Cycle = "month" | "year";

export interface PlanCheckoutInput {
    plan: string;
    cycle: Cycle;
}

/** The two answers this reads from the API, as far as it needs them. */
export interface QuoteAnswer {
    kind: "NEW" | "UPGRADE" | "SCHEDULED" | "TO_FREE" | "NONE";
}

export interface ChangeAnswer {
    kind: QuoteAnswer["kind"];
    authorisationUrl?: string | null;
}

export type ApiAnswer<T> =
    { ok: true; data: T } | { ok: false; status: number; error: string };

export interface PlanCheckoutCalls {
    quote: (input: PlanCheckoutInput) => Promise<ApiAnswer<QuoteAnswer>>;
    change: (input: PlanCheckoutInput) => Promise<ApiAnswer<ChangeAnswer>>;
}

export type PlanCheckoutResult =
    /** Off to the provider's page to authorise it. */
    | { kind: "authorise"; url: string }
    /** Nothing to authorise: on Free, or on the plan already. */
    | { kind: "done" }
    /** It couldn't be started; the business stays on Free. */
    | { kind: "failed"; error: string };

const PLAN_ID = /^[a-z][a-z0-9-]{0,39}$/;

/** A client-sent intent, checked again here: actions take any input. */
export function checkoutInput(input: unknown): PlanCheckoutInput | null {
    if (!input || typeof input !== "object") return null;
    const { plan, cycle } = input as Record<string, unknown>;
    if (typeof plan !== "string" || !PLAN_ID.test(plan)) return null;
    if (cycle !== "month" && cycle !== "year") return null;
    return { plan, cycle };
}

/** Only ever a secure page: the address comes back from a provider. */
function authorisationPage(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

export const CHECKOUT_FAILED =
    "The payment page couldn't be opened, so it's on Free for now.";

export async function startPlanCheckout(
    input: PlanCheckoutInput,
    calls: PlanCheckoutCalls,
): Promise<PlanCheckoutResult> {
    const quote = await calls.quote(input);
    if (!quote.ok) {
        return {
            kind: "failed",
            error:
                quote.status === 404
                    ? "That plan isn't one Saroh offers, so it's on Free."
                    : CHECKOUT_FAILED,
        };
    }
    if (quote.data.kind === "NONE" || quote.data.kind === "TO_FREE") {
        return { kind: "done" };
    }
    const change = await calls.change(input);
    if (!change.ok) return { kind: "failed", error: CHECKOUT_FAILED };
    const url = authorisationPage(change.data.authorisationUrl);
    if (url) return { kind: "authorise", url };
    return change.data.kind === "TO_FREE"
        ? { kind: "done" }
        : { kind: "failed", error: CHECKOUT_FAILED };
}

/** What onboarding says about the plan, or null when there is nothing to say. */
export function planIntentNote(intent: PlanIntent): string | null {
    switch (intent.kind) {
        case "paid":
            return `You picked ${intent.name}, billed ${intent.cycle === "year" ? "yearly" : "monthly"}. Once this is set up, you'll go to the payment page to start it, or you can leave it there and stay on Free.${intent.yearlyDropped ? " Yearly billing isn't offered right now, so it's monthly." : ""}`;
        case "unknown":
            return "The plan in your link isn't one Saroh offers, so this starts on Free.";
        default:
            return null;
    }
}

/** The plan to take to the checkout once the business exists, if any. */
export function checkoutIntent(
    intent: PlanIntent,
): { plan: string; cycle: "month" | "year"; name: string } | null {
    if (intent.kind === "paid") {
        return { plan: intent.plan, cycle: intent.cycle, name: intent.name };
    }
    if (intent.kind === "unchecked") {
        return { plan: intent.plan, cycle: intent.cycle, name: "the plan" };
    }
    return null;
}
