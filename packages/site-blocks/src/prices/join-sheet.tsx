"use client";

import { useEffect, useRef, useState } from "react";

import type { SignedInCustomer } from "../account/api";
import { accountMoney } from "../account/model";
import { Sheet, sheetAltButton, sheetButton } from "../account/sheet";
import { destructiveAlertClasses } from "../alert";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { cn } from "../lib/utils";
import type { JoinApi, JoinResult, PlanJoinStarted } from "./api";
import { joinedMessage, priceKey, PRICES_OFFLINE } from "./api";
import { planEvery, planPeriod } from "./plan-words";

/**
 * Join a plan from the site (round-2 G20; Saroh Customer Site design, the
 * join sheet): the plan's name and what it is, how often and how much,
 * "Starts · Today", and "Start ‹Plan› · ₹2,500".
 *
 * Joining opens the business's own provider window on a payment the server
 * priced: the first period, paid now. Saroh never names or limits the ways
 * to pay (DEC-059): the window shows what the business's account has
 * switched on. What the window says is only a hint: "paid" there starts the
 * wait for the server, which puts the customer on the plan only when the
 * provider's webhook arrives, so the sheet asks how the payment stands until
 * it says joined. Closing the window, or a refusal, offers another go on the
 * same payment.
 *
 * **No autopay yet.** The design's "Pay with" choice (UPI Autopay, card, a
 * saved mandate) belongs to D12, which isn't built. Nothing here promises
 * automatic renewals: each period is paid as it starts.
 */

/** How often, and how long, the sheet asks whether the payment landed. */
export const JOIN_POLL_MS = 2_000;
export const JOIN_POLL_TRIES = 30;

/** The plan the sheet joins, as the Plans block lists it. */
export interface JoinablePlan {
    id: string;
    name: string;
    description: string | null;
    price: string;
    currency: string;
    interval: string;
}

type Phase =
    | { kind: "ready" }
    | {
          kind: "window";
          started: PlanJoinStarted;
          status: "open" | CheckoutOutcome;
      }
    | { kind: "confirming"; started: PlanJoinStarted; tries: number }
    | { kind: "closed" };

export interface JoinSheetProps {
    /** The plan to join; null keeps the sheet closed. */
    plan: JoinablePlan | null;
    onClose: () => void;
    businessName: string;
    customer: SignedInCustomer;
    api: JoinApi;
    /** They are on the plan: say so, and point at the account. */
    onJoined: (message: string) => void;
    /** The session ended since the page loaded: sign in, then come back. */
    onSignedOut: () => void;
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
}

export function JoinSheet(props: JoinSheetProps) {
    const { plan, onClose } = props;
    return (
        <Sheet
            open={plan !== null}
            onClose={onClose}
            title={plan?.name ?? ""}
            lead={plan?.description ?? undefined}
        >
            {/* Keyed on the plan, so each opening starts fresh. */}
            {plan ? <Join key={plan.id} {...props} plan={plan} /> : null}
        </Sheet>
    );
}

function Join({
    plan,
    businessName,
    customer,
    api,
    onJoined,
    onSignedOut,
    onClose,
    openCheckout = openProviderCheckout,
}: JoinSheetProps & { plan: JoinablePlan }) {
    const [phase, setPhase] = useState<Phase>({ kind: "ready" });
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const session = useRef<{ close: () => void } | null>(null);
    // One key for this opening: a retry replays the same payment.
    const key = useRef(priceKey("join"));

    function launch(started: PlanJoinStarted) {
        session.current?.close();
        const opened = openCheckout({
            handoff: started.payment,
            business: businessName,
            description: started.plan.name,
            booker: { name: customer.name ?? "", email: customer.email },
        });
        session.current = opened;
        setPhase({ kind: "window", started, status: "open" });
        void opened.outcome.then((outcome) => {
            if (session.current !== opened) return;
            setPhase(
                outcome === "paid"
                    ? { kind: "confirming", started, tries: 0 }
                    : { kind: "window", started, status: outcome },
            );
        });
    }

    async function start() {
        if (busy) return;
        setBusy(true);
        setProblem(null);
        const result = await api
            .join(plan.id, key.current)
            .catch((): JoinResult<PlanJoinStarted> => ({
                ok: false,
                reason: "error",
                message: PRICES_OFFLINE,
            }));
        setBusy(false);
        if (result.ok) {
            launch(result.data);
            return;
        }
        if (result.reason === "signed-out") {
            onSignedOut();
            return;
        }
        setProblem(result.message);
    }

    // Leaving the sheet closes the window.
    useEffect(
        () => () => {
            session.current?.close();
            session.current = null;
        },
        [],
    );

    // The latest callbacks, so a parent's new function doesn't restart a poll.
    const latest = useRef({ api, onJoined });
    useEffect(() => {
        latest.current = { api, onJoined };
    });

    // Paid in the window: ask the server until it says joined (or closed).
    useEffect(() => {
        if (phase.kind !== "confirming" || phase.tries >= JOIN_POLL_TRIES) {
            return;
        }
        const { started, tries } = phase;
        const timer = setTimeout(
            () => {
                void latest.current.api
                    .standing(started.ref)
                    .catch(() => null)
                    .then((result) => {
                        if (result?.ok && result.data.state === "joined") {
                            latest.current.onJoined(
                                joinedMessage(result.data.plan.name),
                            );
                            return;
                        }
                        setPhase(
                            result?.ok && result.data.state === "closed"
                                ? { kind: "closed" }
                                : {
                                      kind: "confirming",
                                      started,
                                      tries: tries + 1,
                                  },
                        );
                    });
            },
            tries === 0 ? 0 : JOIN_POLL_MS,
        );
        return () => clearTimeout(timer);
    }, [phase]);

    const money = accountMoney(plan.price, plan.currency);

    if (phase.kind === "confirming") {
        const late = phase.tries >= JOIN_POLL_TRIES;
        return (
            <div className="mt-3">
                <p
                    role="status"
                    className="text-site-fg text-[15px] font-semibold"
                >
                    Confirming your payment
                </p>
                <p className="text-site-body mt-1 text-sm leading-normal">
                    {late
                        ? "This is taking longer than usual. You can close this — your plan shows in your account as soon as the payment is confirmed."
                        : "Hold on a moment while we confirm it with the payment provider."}
                </p>
                <p className="text-site-muted mt-3 text-sm">
                    {plan.name} · {money}
                </p>
                {late ? (
                    <button
                        type="button"
                        onClick={onClose}
                        className={sheetButton(false)}
                    >
                        Close
                    </button>
                ) : null}
            </div>
        );
    }

    if (phase.kind === "closed") {
        return (
            <>
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    This payment has closed, so you haven&apos;t joined. Start
                    again to join.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        key.current = priceKey("join");
                        setPhase({ kind: "ready" });
                    }}
                    className={sheetButton(false)}
                >
                    Start again
                </button>
            </>
        );
    }

    const windowStatus = phase.kind === "window" ? phase.status : null;
    const windowOpen = windowStatus === "open";
    const windowProblem =
        windowStatus === "failed"
            ? "The payment didn't go through. Nothing was taken — try again."
            : windowStatus === "unavailable"
              ? "We couldn't open the payment window. Try again in a moment."
              : null;
    const off = busy || windowOpen;
    const every = planEvery(plan);

    return (
        <>
            <div className="border-site-border mt-3 flex items-center gap-2.5 border-t py-2.5 text-sm">
                <span className="min-w-0 flex-1">{every ?? "Price"}</span>
                <span className="font-semibold tabular-nums">{money}</span>
            </div>
            <div className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-sm">
                <span className="min-w-0 flex-1">Starts</span>
                <span className="font-semibold">Today</span>
            </div>
            {/*
             * D12 SEAM — the design's "Pay with" group (UPI Autopay, card, a
             * saved mandate) goes here once D12 ships and the business's
             * provider supports mandates (`supportsMandates`, DEC-038). It
             * sends the choice with `join`; the API takes none until then.
             */}
            <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                You pay for each {planPeriod(plan)} as it starts. Cancel from
                your account any time.
            </p>
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
            {windowProblem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {windowProblem}
                </p>
            ) : windowStatus === "closed" ? (
                <p role="status" className="text-site-body mt-3 text-sm">
                    The payment window closed before you paid.
                </p>
            ) : null}
            <button
                type="button"
                disabled={off}
                onClick={() =>
                    phase.kind === "window"
                        ? launch(phase.started)
                        : void start()
                }
                className={sheetButton(off)}
            >
                {windowOpen
                    ? "Payment window open…"
                    : busy
                      ? "Starting…"
                      : `Start ${plan.name} · ${money}`}
            </button>
            {phase.kind === "window" && !windowOpen ? (
                <button
                    type="button"
                    onClick={() => {
                        session.current?.close();
                        session.current = null;
                        onClose();
                    }}
                    className={sheetAltButton}
                >
                    Not now
                </button>
            ) : null}
            <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                You pay {businessName} in a secure payment window. You&apos;re
                on the plan once the payment goes through.
            </p>
        </>
    );
}
