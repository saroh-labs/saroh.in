"use client";

import type { LookId } from "@saroh/block-contract";

import { timeWords } from "../lib/clock";
import { cn } from "../lib/utils";
import type { CheckoutRequest } from "./checkout";
import type { Phase } from "./flow-state";
import {
    lookLink,
    lookOutline,
    lookPrimary,
    STEP_HEADING,
} from "./look-styles";
import type { CheckoutStatus } from "./use-checkout";
import { useCheckout } from "./use-checkout";

/**
 * A pay-now hold while it is paid, in a look's frame (DEC-172, U10). The
 * same hold, window and watch as Classic's `PayingCard`; only what it says
 * is the look's, and it says only what is known:
 *
 * - the window is open: pay there; the time is held until a time;
 * - closed before paying: nothing was paid; pay again;
 * - the payment didn't go through: try again, or pay at the desk;
 * - the window closed on a payment that isn't confirmed yet — a UPI app
 *   still finishing: wait, and don't pay twice;
 * - the hold ran out is `ExpiredCard`'s, and paid is the booked screen.
 */

export interface PayingWords {
    title: string;
    body: string;
    /** An alert, not news. */
    problem: boolean;
}

/** What the screen says for where the payment stands. Pure. */
export function payingWords({
    status,
    started,
    payError,
}: {
    status: CheckoutStatus;
    /** The payment has been started with the provider (a handoff). */
    started: boolean;
    payError: string | null;
}): PayingWords {
    if (payError) {
        return {
            title: "We couldn't start the payment",
            body: payError,
            problem: true,
        };
    }
    if (!started) {
        return {
            title: "Starting the payment…",
            body: "The payment window opens over this page.",
            problem: false,
        };
    }
    switch (status) {
        case "paid":
            return {
                title: "Waiting for your payment to come through",
                body: "If you paid in your UPI app, there's no need to pay again. This page moves on by itself once it's through.",
                problem: false,
            };
        case "failed":
            return {
                title: "The payment didn't go through",
                body: "Try again, or pay at the desk instead.",
                problem: true,
            };
        case "unavailable":
            return {
                title: "We couldn't open the payment window",
                body: "Check your connection and try again.",
                problem: true,
            };
        case "closed":
            return {
                title: "The payment window was closed",
                body: "Nothing was paid. Pay when you're ready.",
                problem: false,
            };
        default:
            return {
                title: "Pay in the payment window",
                body: "This page moves on by itself once the payment has gone through.",
                problem: false,
            };
    }
}

export function LookPaying({
    look,
    phase,
    now,
    zone,
    headingRef,
    serviceName,
    business,
    booker,
    busy,
    onDesk,
    onBack,
    onPaid,
    apiUrl,
}: {
    look: LookId;
    phase: Extract<Phase, { kind: "paying" }>;
    now: number | null;
    zone: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    serviceName: string;
    business: string;
    booker: CheckoutRequest["booker"];
    busy: boolean;
    /** Book it to pay at the desk instead; absent for a deposit (E8). */
    onDesk?: () => void;
    onBack: () => void;
    onPaid: () => void;
    apiUrl?: string;
}) {
    const request: CheckoutRequest | null =
        phase.handoff && !phase.payError
            ? {
                  handoff: phase.handoff,
                  business,
                  description: `${serviceName} · ${phase.when}`,
                  booker,
                  apiUrl,
              }
            : null;
    const checkout = useCheckout(request, onPaid);
    const words = payingWords({
        status: checkout.status,
        started: phase.handoff !== null,
        payError: phase.payError,
    });
    const until = phase.booking.holdExpiresAt;
    const minutesLeft =
        until && now !== null
            ? Math.max(0, Math.ceil((Date.parse(until) - now) / 60_000))
            : null;
    const canPayAgain =
        !phase.payError &&
        (checkout.status === "failed" ||
            checkout.status === "closed" ||
            checkout.status === "unavailable");
    const waitingOnIt = checkout.status === "paid";
    const payAgain = () => {
        if (!busy) checkout.open();
    };

    return (
        <div data-look-paying="">
            <h2
                ref={headingRef}
                tabIndex={-1}
                className={cn(STEP_HEADING[look], "text-site-fg outline-none")}
            >
                {words.title}
            </h2>
            <p
                role={words.problem ? "alert" : "status"}
                className="text-site-body mt-2 text-[15px] leading-normal"
            >
                {words.body}
            </p>
            <p className="text-site-fg mt-3 text-[15px] font-semibold">
                {serviceName} · {phase.when} · {phase.price}
            </p>
            {until ? (
                <p className="text-site-body mt-1.5 text-[13.5px] leading-normal">
                    We&apos;re holding it for you until {timeWords(until, zone)}
                    {minutesLeft !== null
                        ? `, ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} left`
                        : ""}
                    . If it isn&apos;t paid by then, the time goes back on the
                    calendar and nothing is charged.
                </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3">
                {canPayAgain ? (
                    <button
                        type="button"
                        onClick={payAgain}
                        aria-disabled={busy}
                        className={lookPrimary(busy)}
                    >
                        {checkout.status === "failed"
                            ? `Try again · Pay ${phase.price}`
                            : `Pay ${phase.price}`}
                    </button>
                ) : null}
                {onDesk && !waitingOnIt ? (
                    <button
                        type="button"
                        onClick={onDesk}
                        aria-disabled={busy}
                        className={cn(lookOutline, busy && "opacity-60")}
                    >
                        {busy
                            ? "Booking…"
                            : phase.booking.online
                              ? "Book it and pay later"
                              : "Pay at the desk instead"}
                    </button>
                ) : null}
                {waitingOnIt ? null : (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-disabled={busy}
                        className={cn(lookLink, busy && "opacity-60")}
                    >
                        Pick another time
                    </button>
                )}
            </div>
        </div>
    );
}
