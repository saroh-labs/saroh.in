"use client";

import { useCallback, useEffect, useState } from "react";

import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import { SignInSheet } from "../account/sign-in-sheet";
import type { OpenCheckout } from "../booking-flow/checkout";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type {
    CheckoutStarted,
    ShopCheckoutApi,
    ShopProblem,
    StartCheckout,
} from "./api";
import { SHOP_OFFLINE } from "./api";
import { BagSheet } from "./bag-sheet";
import { bagCount, clearBag, onOpenBag, useBag } from "./bag-store";
import { CheckoutPay } from "./checkout-sheet";

/**
 * The bag in the site's header (round-2 G13), and the sheets it opens: the
 * bag, signing in at the last step, and paying.
 *
 * The header draws it only on a site that takes online orders (the site's
 * server asks the API first); it shows once something is in the bag, as
 * the design's round bag button with its count. Signing in is always on
 * and there is no guest checkout (A2, A9): "Continue" opens the sign-in
 * sheet ("Last step: confirm it's you"), and placing the order goes on by
 * itself once the code checks. When the code can't be sent, the sheet says
 * so with the business's phone, and the bag is kept.
 */

type Step =
    | { kind: "closed" }
    | { kind: "bag" }
    | { kind: "sign-in"; then: StartCheckout }
    | { kind: "pay"; started: CheckoutStarted };

export interface ShopBagProps {
    /** The site the bag belongs to (its id). */
    site: string;
    businessName: string;
    api: ShopCheckoutApi;
    account: {
        customer: SignedInCustomer | null;
        options: SignInOptions;
        signIn: SignInApi;
    };
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
}

export function ShopBag({
    site,
    businessName,
    api,
    account,
    openCheckout,
}: ShopBagProps) {
    const items = useBag(site);
    const count = bagCount(items);
    const [step, setStep] = useState<Step>({ kind: "closed" });
    const [customer, setCustomer] = useState(account.customer);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<{
        reason: ShopProblem;
        message: string;
    } | null>(null);

    useEffect(() => onOpenBag(() => setStep({ kind: "bag" })), []);

    const close = useCallback(() => {
        setStep({ kind: "closed" });
        setProblem(null);
    }, []);
    const placed = useCallback(() => clearBag(site), [site]);

    async function start(request: StartCheckout, who: SignedInCustomer) {
        setBusy(true);
        setProblem(null);
        const result = await api.start(request).catch(() => ({
            ok: false as const,
            reason: "error" as const,
            message: SHOP_OFFLINE,
        }));
        setBusy(false);
        if (result.ok) {
            setCustomer(who);
            setStep({ kind: "pay", started: result.data });
            return;
        }
        if (result.reason === "signed-out") {
            // The session ended since the page loaded: sign in, then go on.
            setCustomer(null);
            setStep({ kind: "sign-in", then: request });
            return;
        }
        setStep({ kind: "bag" });
        setProblem(result);
    }

    function place(request: StartCheckout) {
        if (!customer) {
            setStep({ kind: "sign-in", then: request });
            return;
        }
        void start(request, customer);
    }

    return (
        <>
            {count > 0 ? (
                <button
                    type="button"
                    onClick={() => setStep({ kind: "bag" })}
                    aria-label={`Your bag, ${count} ${count === 1 ? "item" : "items"}`}
                    className={cn(
                        "border-site-border bg-site-surface text-site-fg relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-transform duration-100 hover:opacity-90 active:scale-95",
                        focusRing,
                    )}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M6 7 H18 L17 20 H7 Z M9 7 A3 3 0 0 1 15 7"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span
                        aria-hidden="true"
                        className="bg-site-accent text-site-accent-fg absolute -right-[3px] -top-[3px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold"
                    >
                        {count}
                    </span>
                </button>
            ) : null}

            {step.kind === "bag" ? (
                <BagSheet
                    site={site}
                    items={items}
                    api={api}
                    signedIn={customer !== null}
                    busy={busy}
                    problem={problem}
                    onPlace={place}
                    onClose={close}
                />
            ) : null}

            <SignInSheet
                open={step.kind === "sign-in"}
                onClose={() => setStep({ kind: "bag" })}
                options={account.options}
                api={account.signIn}
                purpose="book"
                onSignedIn={(who) => {
                    setCustomer(who);
                    if (step.kind === "sign-in") void start(step.then, who);
                }}
            />

            {step.kind === "pay" && customer ? (
                <CheckoutPay
                    started={step.started}
                    api={api}
                    businessName={businessName}
                    customer={customer}
                    onPlaced={placed}
                    onBack={() => setStep({ kind: "bag" })}
                    onClose={close}
                    openCheckout={openCheckout}
                />
            ) : null}
        </>
    );
}
