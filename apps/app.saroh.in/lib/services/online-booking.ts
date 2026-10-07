import type { BookingPaymentView } from "@/lib/staff/types";

import type { DepositMode } from "./service";

/*
 * What happens when people book a service online, as its payment allows
 * (DEC-088, DEC-089, #821). A deposit or the full price at booking is
 * paid online when it can be. When it can't — the business takes payment
 * at the desk only, Payments is off, or no provider is connected — it is
 * paid at the desk wherever the business allows the desk; under Online
 * only, the service can't be booked online at all, and neither can any
 * priced service while online can't be taken. The Service Editor says
 * which where the deposit is chosen; the Services list marks only a
 * service that can't be booked. Pure, so both and their tests agree.
 */

/** What to do about it: where the fix is, and the link's words. */
export interface OnlineFix {
    href: string;
    label: string;
}

/**
 * What happens to a service's payment when people book it online, when
 * it isn't what the merchant chose, and what fixes it.
 */
export interface OnlineProblem {
    /**
     * True when people can't book it online at all (Online only); false
     * when it books and is paid at the desk instead (DEC-089).
     */
    blocked: boolean;
    /** The whole sentence, for the Service Editor. */
    text: string;
    /** The short one, for a Services card: "Can't be booked online: …". */
    line: string;
    fix: OnlineFix;
}

const RULES_FIX: OnlineFix = {
    href: "/bookings/availability",
    label: "Change it in Booking rules",
};
const PROVIDER_FIX: OnlineFix = {
    href: "/settings/providers",
    label: "Connect one in Settings › Providers",
};
/** Where a plan without online payments is changed (#821, #835). */
export const PLAN_FIX: OnlineFix = {
    href: "/settings/billing#change-plan",
    label: "See plans",
};
const PAYMENTS_FIX: OnlineFix = {
    href: "/settings/modules",
    label: "Turn on Payments",
};

function problem(why: string, fix: OnlineFix): OnlineProblem {
    return {
        blocked: true,
        text: `People can't book this online: ${why}.`,
        line: `Can't be booked online: ${why}.`,
        fix,
    };
}

/** Booked online and paid at the desk, because online can't take it. */
function atDesk(lead: string, why: string, fix: OnlineFix): OnlineProblem {
    const said = `${lead}: ${why}, so nothing is taken when people book.`;
    return { blocked: false, text: said, line: said, fix };
}

/**
 * What happens when people book this service online because of how it is
 * paid, or null when it is paid as chosen — or when it couldn't be told
 * (`payment` null). A service with no price is booked with nothing to pay,
 * whatever the rule.
 */
export function onlineBookingProblem(
    service: { priceCents: number | null; depositMode: DepositMode },
    payment: BookingPaymentView | null,
): OnlineProblem | null {
    if (!payment) return null;
    if (!service.priceCents || service.priceCents <= 0) return null;
    const atBooking = service.depositMode !== "NONE";
    const { bookingPayment, onlineBlocker } = payment;

    if (atBooking && bookingPayment === "DESK") {
        return atDesk(
            "Paid at the desk",
            "your booking rules take payment at the desk only",
            RULES_FIX,
        );
    }
    if (!onlineBlocker) return null;
    if (!atBooking && bookingPayment !== "ONLINE") return null;

    const cant =
        onlineBlocker === "PLAN"
            ? "your plan doesn't take payment online"
            : onlineBlocker === "PAYMENTS_OFF"
              ? "Payments is switched off"
              : "no payment provider is connected";
    const fix =
        onlineBlocker === "PLAN"
            ? PLAN_FIX
            : onlineBlocker === "PAYMENTS_OFF"
              ? PAYMENTS_FIX
              : PROVIDER_FIX;
    if (bookingPayment === "BOTH") {
        return atDesk("Paid at the desk for now", cant, fix);
    }
    return atBooking
        ? problem(`it takes payment when they book, and ${cant}`, fix)
        : problem(
              `your booking rules take payment online only, and ${cant}`,
              fix,
          );
}
