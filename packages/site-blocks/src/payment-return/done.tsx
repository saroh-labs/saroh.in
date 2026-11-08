"use client";

import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "../account/parts";
import type { PaymentReturnView } from "./words";
import {
    backPathOf,
    paymentReturnWords,
    RETURN_POLL_MS,
    RETURN_POLL_TRIES,
} from "./words";

export interface PaymentReturnProps {
    /** The server's first read of the session. */
    initial: PaymentReturnView;
    /** Ask the server again; the page's own server action. Null: it couldn't say. */
    read: () => Promise<PaymentReturnView | null>;
    /** The site's Prices page, where a plan join goes back to by default. */
    pricesPath?: string | null;
    /**
     * Draw the page ground too: for the renderer's apex `/pay/paid`, which
     * has no site layout around it to give one.
     */
    ground?: boolean;
}

/**
 * The business's `/paid` page after Stripe's hosted Checkout (plan
 * 2026-11-07-002, U8), inside the site's own header and theme: "Confirming
 * your payment" while the session is open, asked again every 2 s for about
 * a minute, then "Still confirming" with the way back. Then paid (a
 * booking says its time, in the business's zone), processing, failed or
 * closed (Try again goes back to where they paid from), or refunding (paid
 * after the hold's time was let go). Site tokens only, never Saroh's.
 */
export function PaymentReturn({
    initial,
    read,
    pricesPath = null,
    ground = false,
}: PaymentReturnProps) {
    const [view, setView] = useState(initial);
    const [tries, setTries] = useState(0);
    const latest = useRef(read);
    useEffect(() => {
        latest.current = read;
    });
    const heading = useRef<HTMLHeadingElement>(null);

    const waiting = view.status === "open";
    useEffect(() => {
        if (!waiting || tries >= RETURN_POLL_TRIES) return;
        const timer = setTimeout(() => {
            void latest
                .current()
                .catch(() => null)
                .then((next) => {
                    // A failed ask keeps what the page showed, and asks again.
                    if (next) setView(next);
                    setTries((t) => t + 1);
                });
        }, RETURN_POLL_MS);
        return () => clearTimeout(timer);
    }, [waiting, tries]);

    const late = waiting && tries >= RETURN_POLL_TRIES;
    const words = paymentReturnWords(view, late);
    // Focus follows the news: on arrival, and each time the page's answer
    // changes, so a screen reader starts at the heading.
    useEffect(() => {
        heading.current?.focus();
    }, [words.title]);

    const confirming = waiting && !late;
    const page = (
        <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-site-muted text-sm">{view.businessName}</p>
            <div
                role={words.problem ? "alert" : "status"}
                aria-live={words.problem ? "assertive" : "polite"}
                aria-busy={confirming || undefined}
            >
                <h1
                    ref={heading}
                    tabIndex={-1}
                    className="font-site-heading text-site-fg mt-1 text-2xl font-bold tracking-tight outline-none"
                >
                    {words.title}
                </h1>
                <p className="text-site-body mt-2 leading-normal">
                    {words.body}
                </p>
            </div>
            {confirming ? null : (
                <div className="mt-6 flex flex-wrap gap-2">
                    <a
                        href={backPathOf(view, pricesPath)}
                        className={buttonClasses(true)}
                    >
                        {words.action}
                    </a>
                </div>
            )}
        </section>
    );
    return ground ? (
        <main className="bg-site-bg text-site-body min-h-screen">{page}</main>
    ) : (
        page
    );
}
