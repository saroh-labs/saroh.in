import type { OnlineFix } from "@/lib/services/online-booking";
import { PLAN_FIX } from "@/lib/services/online-booking";
import type { OnlineBlocker } from "@/lib/staff/types";

/**
 * What Invoice Detail's Payment panel says when an unpaid invoice's link
 * can't take payment (DEC-070), and the fix where there is one. The plan
 * is asked first, as the API asks it (#835): on a plan without online
 * payments, connecting a provider changes nothing, so the merchant is
 * pointed at the plans with the Service Editor's words
 * (`lib/services/online-booking.ts`). Pure.
 */
export function offlinePayHint({
    blocker,
    paymentsOn,
    providerConnected,
    who,
}: {
    blocker: OnlineBlocker | null;
    paymentsOn: boolean;
    providerConnected: boolean;
    who: string;
}): { text: string; fix: OnlineFix | null } {
    if (blocker === "PLAN") {
        return {
            text: "Online payment comes with a paid plan. Its link shows the invoice and how to pay you, with no Pay button.",
            fix: PLAN_FIX,
        };
    }
    // Nothing connected at all. A connection that can't open the checkout
    // yet (a Razorpay key missing) is fixed on its own row, not here.
    if (blocker !== "PAYMENTS_OFF" && paymentsOn && !providerConnected) {
        return {
            text: "Connect a payment provider to take payment online.",
            fix: { href: "/settings/providers", label: "Connect one" },
        };
    }
    // Payments is off, or its provider can't take a payment: the link
    // only shows the invoice.
    return {
        text: `Its link shows the invoice with no Pay button. ${who} pays you the way you've asked them to.`,
        fix: null,
    };
}
