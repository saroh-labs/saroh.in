"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { ctaClasses } from "../blocks/cta";
import type { PaymentHandoff } from "../booking-flow/api";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { phoneText } from "../lib/phone";
import { cn } from "../lib/utils";
import { STANDING_POLL_MS, STANDING_POLL_TRIES } from "../shop/checkout-sheet";

/**
 * Paying from a pay link (an invoice's `/pay/<token>`, an order's
 * `/pay/o/<token>`): the Pay button, the business's own provider window,
 * and where the payment stands, in the customer's words.
 *
 * It is the bag's way of paying (`shop/checkout-sheet.tsx`), on a page
 * instead of a sheet. Pay asks the site's server to start the payment (the
 * amount is the server's, from the invoice or the order), then opens the
 * provider's window on the handoff that comes back, through the one shared
 * helper (`openProviderCheckout`). What the window says is only a hint:
 * "paid" there starts asking the server to read the page again, and the
 * page says "Paid" only when that read does. Nothing here ever marks
 * anything paid.
 *
 * A second press can't start a second payment: the button is held while
 * one is under way, the visit has one key, and another go after a refusal
 * or a closed window opens the same payment again.
 */

/** What starting the payment answered, from the site's server. */
export type PayLinkStart =
    | { ok: true; intent: PaymentHandoff }
    | { ok: false; message: string; settled?: boolean };

/** The business's phone and email, where the page's data has them. */
export interface PayLinkContact {
    phone: string | null;
    email: string | null;
}

type Phase =
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "window" }
    | { kind: "stopped"; why: Exclude<CheckoutOutcome, "paid"> }
    | { kind: "confirming"; tries: number }
    | { kind: "refused"; message: string };

/** What `usePayLink` hands the page. */
export interface PayLinkState {
    phase: Phase;
    /** Start paying, or open the window again. Does nothing while busy. */
    pay: () => void;
    /** A payment is starting, its window is open, or it is being confirmed. */
    busy: boolean;
    /** A payment was started on this visit: there is something to check. */
    started: boolean;
    /** Confirming has gone on longer than usual. */
    slow: boolean;
}

export interface PayLinkOptions {
    /** Starts the payment on the site's server, under the visit's key. */
    start: (idempotencyKey: string) => Promise<PayLinkStart>;
    /** Reads the page again from the server. */
    refresh: () => void;
    businessName: string;
    /** What is being paid for, at the top of the window: "Invoice INV-7". */
    description: string;
    /** Who is paying, to fill the window; the page knows a name at most. */
    payerName?: string | null;
    /** Where the window's return is posted, so paying moves on at once (P1). */
    apiUrl?: string;
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
}

function newKey(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
}

export function usePayLink({
    start,
    refresh,
    businessName,
    description,
    payerName,
    apiUrl,
    openCheckout = openProviderCheckout,
}: PayLinkOptions): PayLinkState {
    const [phase, setPhase] = useState<Phase>({ kind: "idle" });
    const [intent, setIntent] = useState<PaymentHandoff | null>(null);
    // One key per visit, so a double tap can't start two payments.
    const [key] = useState(newKey);
    // Held from the press itself, before React has drawn the button off.
    const held = useRef(false);
    const session = useRef<{ close: () => void } | null>(null);
    // The page's own read, as it is now: a new function on every render
    // must not restart the wait below.
    const reread = useRef(refresh);
    useEffect(() => {
        reread.current = refresh;
    });

    function launch(handoff: PaymentHandoff) {
        session.current?.close();
        setPhase({ kind: "window" });
        const opened = openCheckout({
            handoff,
            business: businessName,
            description,
            booker: { name: payerName?.trim() ?? "", email: "" },
            apiUrl,
        });
        session.current = opened;
        void opened.outcome.then((outcome) => {
            // A window the page has since replaced or closed says nothing.
            if (session.current !== opened) return;
            held.current = outcome === "paid";
            setPhase(
                outcome === "paid"
                    ? { kind: "confirming", tries: 0 }
                    : { kind: "stopped", why: outcome },
            );
        });
    }

    function pay() {
        if (held.current) return;
        held.current = true;
        // Another go after a refusal or a closed window: the same payment.
        if (intent) {
            launch(intent);
            return;
        }
        setPhase({ kind: "starting" });
        void start(key)
            .catch((): PayLinkStart => ({
                ok: false,
                message:
                    "We couldn't reach the business. Try again in a moment.",
            }))
            .then((result) => {
                if (result.ok) {
                    setIntent(result.intent);
                    launch(result.intent);
                    return;
                }
                held.current = false;
                setPhase({ kind: "refused", message: result.message });
                // Paid or closed meanwhile: the page's own read says which.
                if (result.settled) refresh();
            });
    }

    // Leaving the page closes the window.
    useEffect(
        () => () => {
            session.current?.close();
            session.current = null;
        },
        [],
    );

    // Paid in the window: read the page again until the server says so.
    // When it does, the page draws "Paid" and this is gone.
    const tries = phase.kind === "confirming" ? phase.tries : null;
    useEffect(() => {
        if (tries === null || tries >= STANDING_POLL_TRIES) return;
        const timer = setTimeout(
            () => {
                reread.current();
                setPhase((now) =>
                    now.kind === "confirming"
                        ? { kind: "confirming", tries: tries + 1 }
                        : now,
                );
            },
            tries === 0 ? 0 : STANDING_POLL_MS,
        );
        return () => clearTimeout(timer);
    }, [tries]);

    const slow = tries !== null && tries >= STANDING_POLL_TRIES;
    return {
        phase,
        pay,
        busy:
            phase.kind === "starting" ||
            phase.kind === "window" ||
            (phase.kind === "confirming" && !slow),
        started: intent !== null,
        slow,
    };
}

/** Why the window stopped without a payment, in the customer's words. */
export function payLinkStopWords(why: Exclude<CheckoutOutcome, "paid">): {
    text: string;
    /** A refusal is an alert; a window they closed themselves is not. */
    alert: boolean;
} {
    if (why === "failed") {
        return {
            text: "The payment didn't go through. Nothing was taken. Try again.",
            alert: true,
        };
    }
    if (why === "unavailable") {
        return {
            text: "We couldn't open the payment window. Check your connection and try again.",
            alert: true,
        };
    }
    return {
        text: "The payment window closed before you paid.",
        alert: false,
    };
}

/** What the Pay button reads at each point. */
export function payLinkButtonLabel(
    state: Pick<PayLinkState, "phase">,
    amount: string,
): string {
    const { phase } = state;
    if (phase.kind === "starting") return "Starting payment…";
    if (phase.kind === "window") return "Payment window open…";
    if (phase.kind === "stopped" && phase.why !== "closed") {
        return `Try again · ${amount}`;
    }
    return `Pay ${amount}`;
}

/**
 * Where the payment stands, above the button: nothing before a payment is
 * started.
 */
export function PayLinkStatus({
    state,
    businessName,
}: {
    state: PayLinkState;
    businessName: string;
}) {
    const { phase } = state;
    if (phase.kind === "refused") {
        return (
            <p role="alert" className={destructiveAlertClasses}>
                {phase.message}
            </p>
        );
    }
    if (phase.kind === "stopped") {
        const words = payLinkStopWords(phase.why);
        return (
            <p
                role={words.alert ? "alert" : "status"}
                className={
                    words.alert
                        ? destructiveAlertClasses
                        : "text-site-body text-sm"
                }
            >
                {words.text}
            </p>
        );
    }
    if (phase.kind === "window") {
        return (
            <p role="status" className="text-site-body text-sm">
                Finish paying in the secure payment window.
            </p>
        );
    }
    if (phase.kind === "confirming") {
        return (
            <div
                role="status"
                className="border-site-border bg-site-surface rounded-xl border p-5 text-center"
            >
                <p className="text-site-fg font-semibold">
                    {state.slow
                        ? "Still checking your payment"
                        : "Confirming your payment"}
                </p>
                <p className="text-site-muted mt-1 text-sm">
                    {state.slow
                        ? `This is taking longer than usual. There's no need to pay again. ${businessName} gets your payment as soon as it's confirmed.`
                        : "Hold on a moment while we confirm it with the payment provider. There's no need to pay again."}
                </p>
            </div>
        );
    }
    return null;
}

/** The business's phone and email under the Pay button, when it has them. */
export function PayLinkHelp({
    contact,
    businessName,
}: {
    contact: PayLinkContact | null | undefined;
    businessName: string;
}) {
    if (!contact || (!contact.phone && !contact.email)) return null;
    const link = "text-site-fg underline underline-offset-2";
    return (
        <p className="text-site-body text-center text-sm">
            Need help? Reach {businessName}
            {contact.phone ? (
                <>
                    {" on "}
                    <a href={`tel:${contact.phone}`} className={link}>
                        {phoneText(contact.phone)}
                    </a>
                </>
            ) : null}
            {contact.email ? (
                <>
                    {contact.phone ? " or at " : " at "}
                    <a
                        href={`mailto:${contact.email}`}
                        className={cn(link, "break-all")}
                    >
                        {contact.email}
                    </a>
                </>
            ) : null}
        </p>
    );
}

/**
 * The whole of it for a page with one way to pay: where it stands, the Pay
 * button, the business's contact, and "Check again" once there is a payment
 * to check. A page with a choice of its own before paying (an invoice's
 * autopay) draws that as `choice` in place of the button.
 */
export function PayLinkPay({
    amount,
    contact,
    choice,
    ...options
}: PayLinkOptions & {
    /** What paying now charges, as the page shows it: "₹1,400.00". */
    amount: string;
    contact?: PayLinkContact | null;
    /** The page's own controls in place of the Pay button. */
    choice?: (state: PayLinkState) => ReactNode;
}) {
    const state = usePayLink(options);
    const confirming = state.phase.kind === "confirming";
    return (
        <div className="space-y-4">
            <PayLinkStatus state={state} businessName={options.businessName} />
            {confirming ? null : choice ? (
                choice(state)
            ) : (
                <button
                    type="button"
                    onClick={state.pay}
                    disabled={state.busy}
                    className={cn(
                        ctaClasses("primary"),
                        "w-full disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {payLinkButtonLabel(state, amount)}
                </button>
            )}
            <PayLinkHelp
                contact={contact}
                businessName={options.businessName}
            />
            {/* Only once a payment was started: before that there's
                nothing to check (UX-080). */}
            {state.started && !state.busy ? (
                <button
                    type="button"
                    onClick={options.refresh}
                    className={cn(ctaClasses("secondary"), "w-full")}
                >
                    Check again
                </button>
            ) : null}
        </div>
    );
}
