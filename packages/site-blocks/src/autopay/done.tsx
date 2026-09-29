"use client";

import { useEffect, useRef, useState } from "react";

import { accountDate, accountMoney } from "../account/model";
import { buttonClasses } from "../account/parts";
import type { AutopayOutcome } from "./api";
import { autopayWith } from "./words";

/**
 * The page a customer lands on after setting up autopay (round-2 D12), on
 * the business's own site — never Saroh's or the provider's: "You're on
 * ‹plan›. Autopay is on with UPI (mo•••@okicici). Next payment ‹date›."
 * with the way back to their account.
 *
 * While the provider hasn't confirmed, it says "Being confirmed" and asks
 * again by itself. A set-up that didn't go through says whether the
 * payment did, and offers to try autopay again. Site tokens only.
 */

/** What the page knows now. */
export type AutopayDoneState =
    | { kind: "outcome"; outcome: AutopayOutcome }
    /** A plan being joined whose payment hasn't landed yet. */
    | { kind: "joining" }
    /** A join whose payment closed: nobody joined. */
    | { kind: "closed"; plan: string }
    | { kind: "signed-out" }
    | { kind: "error" };

/** How often, and how many times, the page asks again. */
export const DONE_POLL_MS = 3_000;
export const DONE_POLL_TRIES = 20;

export interface AutopayDoneProps {
    businessName: string;
    initial: AutopayDoneState;
    /** Ask the server again; the page's own server action. */
    read: () => Promise<AutopayDoneState>;
    /** The customer's account, where their plan shows. */
    accountHref: string;
    /** Where to try autopay again: the pay link, or My plan. */
    retryHref: string;
}

function waiting(state: AutopayDoneState): boolean {
    return (
        state.kind === "joining" ||
        (state.kind === "outcome" && state.outcome.autopay?.state === "PENDING")
    );
}

export function AutopayDone({
    businessName,
    initial,
    read,
    accountHref,
    retryHref,
}: AutopayDoneProps) {
    const [state, setState] = useState(initial);
    const [tries, setTries] = useState(0);
    const latest = useRef(read);
    useEffect(() => {
        latest.current = read;
    });

    useEffect(() => {
        if (!waiting(state) || tries >= DONE_POLL_TRIES) return;
        const timer = setTimeout(() => {
            void latest
                .current()
                .catch((): AutopayDoneState => ({ kind: "error" }))
                .then((next) => {
                    // A failed ask keeps what the page showed, and asks again.
                    if (next.kind !== "error") setState(next);
                    setTries((t) => t + 1);
                });
        }, DONE_POLL_MS);
        return () => clearTimeout(timer);
    }, [state, tries]);

    const late = tries >= DONE_POLL_TRIES;
    const account = (
        <a href={accountHref} className={buttonClasses(true)}>
            Go to your account
        </a>
    );

    let title: string;
    let body: string;
    let actions = account;
    let live: "status" | "alert" = "status";
    switch (state.kind) {
        case "joining":
            title = "Confirming your payment";
            body = late
                ? "This is taking longer than usual. Your plan shows in your account as soon as the payment is confirmed."
                : "Hold on a moment while we confirm it. This page updates by itself.";
            break;
        case "closed":
            title = "You haven't joined";
            body = `This payment has closed, so you're not on ${state.plan}. Start again from ${businessName}'s prices.`;
            live = "alert";
            break;
        case "signed-out":
            title = "Sign in to see your plan";
            body = "Your autopay shows in your account once you sign in.";
            actions = (
                <a href={accountHref} className={buttonClasses(true)}>
                    Sign in
                </a>
            );
            break;
        case "error":
            title = "We couldn't check your autopay";
            body =
                "Refresh the page to try again. Your plan and its autopay show in your account too.";
            live = "alert";
            break;
        case "outcome": {
            const o = state.outcome;
            const next =
                o.nextPaymentAt && o.nextAmount
                    ? ` Next payment ${accountMoney(o.nextAmount, o.currency)} on ${accountDate(o.nextPaymentAt, o.timezone)}.`
                    : "";
            const a = o.autopay;
            if (a && (a.state === "ON" || a.state === "PAUSED")) {
                title = `You're on ${o.plan}.`;
                body =
                    a.state === "ON"
                        ? `Autopay is on with ${autopayWith(a)}.${next}`
                        : `Autopay is set up with ${autopayWith(a)}, and paused in your UPI app.${next}`;
            } else if (a?.state === "PENDING") {
                title = "Being confirmed";
                body = late
                    ? `${o.paid ? "Your payment went through. " : ""}Autopay is still being confirmed with the payment provider. It shows in your account as soon as it's on.`
                    : `${o.paid ? "Your payment went through. " : ""}We're confirming autopay with the payment provider. This page updates by itself.`;
            } else {
                title = "Autopay isn't on";
                body = o.paid
                    ? `Your payment went through — ${o.plan} is paid. Autopay didn't turn on, so your next payment comes as a link to pay.`
                    : `Your payment hasn't gone through, and autopay isn't on for ${o.plan}.`;
                live = "alert";
                actions = (
                    <>
                        <a href={retryHref} className={buttonClasses(true)}>
                            Try autopay again
                        </a>
                        <a href={accountHref} className={buttonClasses(false)}>
                            Go to your account
                        </a>
                    </>
                );
            }
            break;
        }
    }

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-site-muted text-sm">{businessName}</p>
            <div role={live} aria-live="polite">
                <h1 className="font-site-heading text-site-fg mt-1 text-2xl font-bold tracking-tight">
                    {title}
                </h1>
                <p className="text-site-body mt-2 leading-normal">{body}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">{actions}</div>
        </section>
    );
}
