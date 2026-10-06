import type { BookingPaymentView } from "@/lib/staff/types";

import type { DepositMode } from "./service";

/*
 * Whether people can book a service online, as its payment allows
 * (DEC-088, #821). A deposit or the full price at booking is only ever
 * paid online, so it needs the business to take payment online and a
 * provider that can take it; a business that takes payment online only
 * needs that provider for every priced service. The Service Editor says
 * so where the deposit is chosen, and the Services list marks the service.
 * Pure, so both and their tests agree.
 */

/** What to do about it: where the fix is, and the link's words. */
export interface OnlineFix {
    href: string;
    label: string;
}

/** Why a service can't be booked online, and what fixes it. */
export interface OnlineProblem {
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
const PAYMENTS_FIX: OnlineFix = {
    href: "/settings/modules",
    label: "Turn on Payments",
};

function problem(why: string, fix: OnlineFix, more = ""): OnlineProblem {
    return {
        text: `People can't book this online: ${why}.${more ? ` ${more}` : ""}`,
        line: `Can't be booked online: ${why}.`,
        fix,
    };
}

/**
 * Why people can't book this service online because of how it is paid,
 * or null when they can — or when it couldn't be told (`payment` null). A
 * service with no price is booked with nothing to pay, whatever the rule.
 */
export function onlineBookingProblem(
    service: { priceCents: number | null; depositMode: DepositMode },
    payment: BookingPaymentView | null,
): OnlineProblem | null {
    if (!payment) return null;
    if (!service.priceCents || service.priceCents <= 0) return null;
    const atBooking = service.depositMode !== "NONE";
    const { bookingPayment, onlineBlocker } = payment;
    const takes = "it takes payment when they book";

    if (atBooking && bookingPayment === "DESK") {
        return problem(
            `${takes}, and your booking rules take payment at the desk only`,
            RULES_FIX,
            "Take nothing at booking, or let people pay online.",
        );
    }
    if (!onlineBlocker) return null;
    if (!atBooking && bookingPayment !== "ONLINE") return null;

    const cant =
        onlineBlocker === "PAYMENTS_OFF"
            ? "Payments is switched off"
            : "no payment provider is connected";
    const fix = onlineBlocker === "PAYMENTS_OFF" ? PAYMENTS_FIX : PROVIDER_FIX;
    return atBooking
        ? problem(`${takes}, and ${cant}`, fix)
        : problem(
              `your booking rules take payment online only, and ${cant}`,
              fix,
          );
}
