"use client";

import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { PayOption } from "../booking-flow/steps/pay-option";
import type { AutopayMethod, AutopayStart } from "./api";
import { autopayMethodLabel, autopayMethodSub } from "./words";

/**
 * The customer picks how autopay pays (round-2 D12; the design's "Pay
 * with"): every method the business's provider offers, by its plain name,
 * as the booking flow's pay options are drawn. Never narrowed (DEC-059).
 */
export function AutopayMethodChoice({
    methods,
    chosen,
    onPick,
    label = "Autopay with",
}: {
    methods: readonly AutopayMethod[];
    chosen: AutopayMethod | null;
    onPick: (method: AutopayMethod) => void;
    label?: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="mt-2 grid gap-2">
            {methods.map((method) => (
                <PayOption
                    key={method}
                    on={chosen === method}
                    label={autopayMethodLabel(method)}
                    sub={autopayMethodSub(method)}
                    onPick={() => onPick(method)}
                />
            ))}
        </div>
    );
}

/** What opening the provider for a set-up ended with. */
export type AutopayWindowOutcome = CheckoutOutcome | "redirected";

/**
 * Open the provider for a set-up: its window on this page (Razorpay's
 * Checkout, taking the recurring order), or, when it has no window to
 * give, its own page, which sends the customer back to the business's site
 * after. What the window says is only a hint: the page they land on asks
 * the server how autopay stands.
 */
export async function openAutopayWindow(
    start: AutopayStart,
    request: {
        openCheckout: OpenCheckout;
        business: string;
        description: string;
        booker: { name: string; email: string };
        /** Where the window's return is posted (P1). */
        apiUrl?: string;
    },
): Promise<AutopayWindowOutcome> {
    const session = request.openCheckout({
        handoff: start.handoff,
        business: request.business,
        description: request.description,
        booker: request.booker,
        apiUrl: request.apiUrl,
    });
    const outcome = await session.outcome;
    if (outcome === "unavailable" && start.authorisationUrl) {
        window.location.assign(start.authorisationUrl);
        return "redirected";
    }
    return outcome;
}

/**
 * Go to the page on the business's own site that says how autopay stands
 * (never Saroh's or the provider's). False when the business has none, and
 * the caller says it in place.
 */
export function landOnBusinessSite(start: AutopayStart): boolean {
    if (!start.returnUrl) return false;
    window.location.assign(start.returnUrl);
    return true;
}
