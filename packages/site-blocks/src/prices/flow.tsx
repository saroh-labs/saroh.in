"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

import type { SignedInCustomer } from "../account/api";
import { SignInSheet } from "../account/sign-in-sheet";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { PricesActions } from "./api";

/**
 * Signing in first, for Join and Buy on the Prices page (round-2 G20).
 *
 * Sign-in is always on and there is no guest path (A2, A9): a visitor who
 * taps Join or Buy gets the sign-in sheet ("Last step: confirm it's you"),
 * and the join or purchase goes on by itself once the code checks. When the
 * code can't be sent the sheet says so, with the business's phone, and
 * nothing is started.
 */
export function useSignInFirst(actions: PricesActions | null): {
    customer: SignedInCustomer | null;
    /** Run `then` as the signed-in customer, signing in first if needed. */
    signedIn: (then: (who: SignedInCustomer) => void) => void;
    /** The session ended: forget who it was, and sign in again. */
    signInAgain: (then: (who: SignedInCustomer) => void) => void;
    sheet: ReactNode;
} {
    const [customer, setCustomer] = useState(actions?.customer ?? null);
    const [asking, setAsking] = useState(false);
    const next = useRef<((who: SignedInCustomer) => void) | null>(null);

    function ask(then: (who: SignedInCustomer) => void) {
        next.current = then;
        setAsking(true);
    }

    return {
        customer,
        signedIn: (then) => (customer ? then(customer) : ask(then)),
        signInAgain: (then) => {
            setCustomer(null);
            ask(then);
        },
        sheet: actions ? (
            <SignInSheet
                open={asking}
                onClose={() => {
                    next.current = null;
                    setAsking(false);
                }}
                options={actions.signInOptions}
                api={actions.signIn}
                purpose="book"
                onSignedIn={(who) => {
                    setCustomer(who);
                    setAsking(false);
                    const then = next.current;
                    next.current = null;
                    then?.(who);
                }}
            />
        ) : null,
    };
}

/**
 * What a join or a purchase says once it's done, above the section's
 * cards, with the way to the account where it now shows.
 */
export function PricesDone({
    message,
    accountHref,
}: {
    message: string;
    accountHref: string;
}) {
    return (
        <p
            role="status"
            className="border-site-border bg-site-surface text-site-fg mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[calc(var(--site-radius)*1.4)] border px-4 py-3 text-sm"
        >
            <span className="min-w-0 flex-1 font-semibold">{message}</span>
            <a
                href={accountHref}
                className={cn(
                    "text-site-accent cursor-pointer rounded-[var(--site-radius)] font-semibold underline-offset-4 hover:underline active:opacity-70",
                    focusRing,
                )}
            >
                See it in your account
            </a>
        </p>
    );
}
