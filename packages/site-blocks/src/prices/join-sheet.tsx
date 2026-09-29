"use client";

import { useEffect, useRef, useState } from "react";

import type { SignedInCustomer } from "../account/api";
import { accountMoney } from "../account/model";
import { Sheet, sheetAltButton, sheetButton } from "../account/sheet";
import { destructiveAlertClasses } from "../alert";
import type { AutopayMethod, AutopayStart } from "../autopay/api";
import { AutopayMethodChoice, landOnBusinessSite } from "../autopay/choice";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { PayOption } from "../booking-flow/steps/pay-option";
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
 * **Autopay (D12).** When the business's provider takes autopay
 * (`autopayMethods`), the design's "Pay with" choice comes first: "Pay ₹X
 * and turn on autopay" (the default) or "Just pay for this month", and how
 * autopay pays — every method the provider offers, by its plain name. UPI
 * and card: one window pays the first period and authorises, and the
 * customer lands on the page on the business's site that says how autopay
 * stands. eMandate: the join is paid first, then authorised (nothing taken).
 * Without autopay methods, nothing here promises automatic renewals.
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
    /** Joined; now authorising eMandate autopay (D12). */
    | { kind: "authorising" }
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
    /**
     * Every way the business's provider can take autopay (D12); empty or
     * absent: autopay isn't offered.
     */
    autopayMethods?: readonly AutopayMethod[];
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

/** Said when autopay couldn't be set up after joining. */
const AUTOPAY_LATER =
    "Autopay isn't on yet — you can set it up from your account.";

function Join({
    plan,
    businessName,
    customer,
    api,
    onJoined,
    onSignedOut,
    onClose,
    autopayMethods = [],
    openCheckout = openProviderCheckout,
}: JoinSheetProps & { plan: JoinablePlan }) {
    const [phase, setPhase] = useState<Phase>({ kind: "ready" });
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const offersAutopay = autopayMethods.length > 0;
    // "Pay and turn on autopay" is the default where autopay is offered.
    const [autopayOn, setAutopayOn] = useState(offersAutopay);
    const [method, setMethod] = useState<AutopayMethod | null>(
        autopayMethods[0] ?? null,
    );
    const session = useRef<{ close: () => void } | null>(null);
    // One key for this opening: a retry replays the same payment.
    const key = useRef(priceKey("join"));
    const chosen = offersAutopay && autopayOn ? method : null;

    function openWindow(
        handoff: PlanJoinStarted["payment"],
        then: (outcome: CheckoutOutcome) => void,
    ) {
        session.current?.close();
        const opened = openCheckout({
            handoff,
            business: businessName,
            description: plan.name,
            booker: { name: customer.name ?? "", email: customer.email },
        });
        session.current = opened;
        void opened.outcome.then((outcome) => {
            if (session.current !== opened) return;
            then(outcome);
        });
    }

    function launch(started: PlanJoinStarted) {
        setPhase({ kind: "window", started, status: "open" });
        openWindow(started.payment, (outcome) => {
            const autopay = started.autopay ?? null;
            // No window to give: the provider's own page, which sends them
            // back to the business's site.
            if (outcome === "unavailable" && autopay?.authorisationUrl) {
                window.location.assign(autopay.authorisationUrl);
                return;
            }
            // Paid and authorised in one window: the business's own page
            // says how autopay stands (D12).
            if (outcome === "paid" && autopay && landOnBusinessSite(autopay)) {
                return;
            }
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
        const result = await (
            chosen
                ? api.join(plan.id, key.current, chosen)
                : api.join(plan.id, key.current)
        ).catch((): JoinResult<PlanJoinStarted> => ({
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
    const latest = useRef({ api, onJoined, chosen, openWindow });
    useEffect(() => {
        latest.current = { api, onJoined, chosen, openWindow };
    });

    /**
     * Joined with eMandate chosen (D12): authorise it now, on the new plan
     * (nothing is taken), then land on the business's page. Anything that
     * stops it leaves them joined, and says autopay can come later.
     */
    async function authoriseAfterJoin(name: string, subscriptionRef: string) {
        const {
            api: live,
            onJoined: joined,
            openWindow: open,
        } = latest.current;
        const welcome = joinedMessage(name);
        if (!live.startAutopay) {
            joined(`${welcome} ${AUTOPAY_LATER}`);
            return;
        }
        setPhase({ kind: "authorising" });
        const result = await live
            .startAutopay(subscriptionRef, "EMANDATE", priceKey("join"))
            .catch((): JoinResult<AutopayStart> => ({
                ok: false,
                reason: "error",
                message: PRICES_OFFLINE,
            }));
        if (!result.ok) {
            joined(`${welcome} ${AUTOPAY_LATER}`);
            return;
        }
        const autopay = result.data;
        open(autopay.handoff, (outcome) => {
            if (outcome === "unavailable" && autopay.authorisationUrl) {
                window.location.assign(autopay.authorisationUrl);
                return;
            }
            if (outcome === "paid" && landOnBusinessSite(autopay)) return;
            joined(
                outcome === "paid" ? welcome : `${welcome} ${AUTOPAY_LATER}`,
            );
        });
    }

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
                            const ref = result.data.subscriptionRef;
                            if (latest.current.chosen === "EMANDATE" && ref) {
                                void authoriseAfterJoin(
                                    result.data.plan.name,
                                    ref,
                                );
                                return;
                            }
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

    if (phase.kind === "authorising") {
        return (
            <div className="mt-3">
                <p
                    role="status"
                    className="text-site-fg text-[15px] font-semibold"
                >
                    You&apos;re on {plan.name}. Now set up autopay
                </p>
                <p className="text-site-body mt-1 text-sm leading-normal">
                    Approve autopay with your bank in the window that opens.
                    Nothing is taken to set it up.
                </p>
            </div>
        );
    }

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
    const off =
        busy || windowOpen || (chosen === null && autopayOn && offersAutopay);
    const every = planEvery(plan);
    const period = planPeriod(plan);
    // The choice is made before the window: a started payment keeps it.
    const choosing = phase.kind === "ready";
    const cta = windowOpen
        ? "Payment window open…"
        : busy
          ? "Starting…"
          : chosen === "EMANDATE"
            ? `Pay ${money}, then set up autopay`
            : chosen
              ? `Pay ${money} and turn on autopay`
              : `Start ${plan.name} · ${money}`;

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
            {offersAutopay && choosing ? (
                <>
                    <p className="text-site-fg mt-3 text-sm font-semibold">
                        Pay with
                    </p>
                    <div
                        role="radiogroup"
                        aria-label="Pay with"
                        className="mt-2 grid gap-2"
                    >
                        <PayOption
                            on={autopayOn}
                            label={`Pay ${money} and turn on autopay`}
                            sub={`Each ${period} is paid automatically. Cancel any time from your account.`}
                            onPick={() => setAutopayOn(true)}
                        />
                        <PayOption
                            on={!autopayOn}
                            label={`Just pay for this ${period}`}
                            sub={`You pay for each ${period} as it starts.`}
                            onPick={() => setAutopayOn(false)}
                        />
                    </div>
                    {autopayOn ? (
                        <AutopayMethodChoice
                            methods={autopayMethods}
                            chosen={method}
                            onPick={setMethod}
                        />
                    ) : null}
                </>
            ) : (
                <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                    You pay for each {period} as it starts. Cancel from your
                    account any time.
                </p>
            )}
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
                {cta}
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
