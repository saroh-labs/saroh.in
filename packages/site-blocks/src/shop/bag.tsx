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
import { readQrSource } from "../qr-source";
import { useTestRelease } from "../test-release/context";
import { TestReleaseStopSheet } from "../test-release/test-release-stop";
import { itemsText } from "../test-release/words";
import type {
    CheckoutStarted,
    ShopCheckoutApi,
    ShopProblem,
    StartCheckout,
} from "./api";
import { SHOP_OFFLINE } from "./api";
import type { BagDraft, BagPriced } from "./bag-sheet";
import { BagSheet, EMPTY_DRAFT } from "./bag-sheet";
import { bagCount, clearBag, onOpenBag, useBag } from "./bag-store";
import type { OnlineStarted } from "./checkout-sheet";
import {
    CheckoutPay,
    OrderPlacedToPay,
    STANDING_POLL_MS,
    STANDING_POLL_TRIES,
} from "./checkout-sheet";
import { readPendingCheckout, writePendingCheckout } from "./pending-checkout";

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
 *
 * The way, the address and the checkout's key live here, not in the bag
 * sheet, which closes whenever the checkout moves on: coming back to the
 * bag finds them as they were, and the same bag placed again is the same
 * order. A payment made but not yet confirmed when its sheet closes is
 * remembered (`pending-checkout.ts`) and asked about until the server
 * answers; the bag empties once the order is placed. An order paid at the
 * handover is placed when it starts: the bag empties, and the sheet says
 * it is still to be paid.
 *
 * On a test release (DEC-071, T6) the bag is priced as usual, and
 * "Continue" stops there: in place of the sign-in sheet it says what the
 * live site would take for it. No order, no payment.
 */

type Step =
    | { kind: "closed" }
    | { kind: "bag" }
    | { kind: "sign-in"; then: StartCheckout }
    | { kind: "pay"; started: OnlineStarted; request: StartCheckout }
    | { kind: "placed"; started: CheckoutStarted; toPay: string }
    | { kind: "test-release"; priced: BagPriced };

export interface ShopBagProps {
    /** The site the bag belongs to (its id). */
    site: string;
    businessName: string;
    /** "Sold by ‹legal name›" (DEC-121); null draws none. */
    soldBy?: string | null;
    api: ShopCheckoutApi;
    account: {
        customer: SignedInCustomer | null;
        options: SignInOptions;
        signIn: SignInApi;
    };
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
    /**
     * The public API the checkout's return is posted to (P1), so a paid
     * order is placed without waiting for the webhook.
     */
    apiUrl?: string;
}

export function ShopBag({
    site,
    businessName,
    soldBy = null,
    api,
    account,
    openCheckout,
    apiUrl,
}: ShopBagProps) {
    const items = useBag(site);
    const count = bagCount(items);
    const testRelease = useTestRelease() !== null;
    const [step, setStep] = useState<Step>({ kind: "closed" });
    const [customer, setCustomer] = useState(account.customer);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState<BagDraft>(EMPTY_DRAFT);
    // The QR code whose scan opened this page load, when the address it
    // loaded on carried the tag (`qr-source.ts`). The bag's sheet has no
    // address of its own, so the tag is held here, in memory, for as long
    // as the page stays loaded, and sent when a checkout starts. It is
    // never put in the stored bag (`bag-store.ts`) or anywhere else that
    // outlives the page. Never drawn, so the server's null and the
    // browser's tag can differ.
    const [source] = useState(readQrSource);
    // One left from an earlier page is asked about again. It is never
    // drawn, so the server's null and the browser's id can differ.
    const [pending, setPending] = useState<string | null>(() =>
        typeof window === "undefined" ? null : readPendingCheckout(site),
    );
    const [problem, setProblem] = useState<{
        reason: ShopProblem;
        message: string;
    } | null>(null);

    useEffect(() => onOpenBag(() => setStep({ kind: "bag" })), []);

    const close = useCallback(() => {
        setStep({ kind: "closed" });
        setProblem(null);
    }, []);
    const placed = useCallback(() => {
        clearBag(site);
        setDraft(EMPTY_DRAFT);
    }, [site]);

    // A payment being confirmed: remembered until the server answers.
    const confirming = useCallback(
        (orderId: string) => {
            writePendingCheckout(site, orderId);
            setPending(orderId);
        },
        [site],
    );
    const settled = useCallback(() => {
        writePendingCheckout(site, null);
        setPending(null);
    }, [site]);

    // While the pay sheet is closed, keep asking how the remembered one
    // stands, as the sheet would: placed empties the bag; any other answer
    // ends the wait. Signed out, it waits for the next signed-in page.
    const paying = step.kind === "pay";
    useEffect(() => {
        if (!pending || paying || !customer) return;
        let live = true;
        let tries = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const ask = () => {
            void api
                .standing(pending)
                .catch(() => null)
                .then((result) => {
                    if (!live) return;
                    if (result?.ok && result.data.state !== "paying") {
                        if (result.data.state === "placed") placed();
                        settled();
                        return;
                    }
                    if (
                        result &&
                        !result.ok &&
                        result.reason === "signed-out"
                    ) {
                        return;
                    }
                    tries += 1;
                    if (tries < STANDING_POLL_TRIES) {
                        timer = setTimeout(ask, STANDING_POLL_MS);
                    }
                });
        };
        ask();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [pending, paying, customer, api, placed, settled]);

    async function start(request: StartCheckout, who: SignedInCustomer) {
        setBusy(true);
        setProblem(null);
        const asked = source ? { ...request, source } : request;
        const result = await api.start(asked).catch(() => ({
            ok: false as const,
            reason: "error" as const,
            message: SHOP_OFFLINE,
        }));
        setBusy(false);
        if (result.ok) {
            setCustomer(who);
            const started = result.data;
            if (started.payment === null) {
                // Paid at the handover: placed already, nothing to pay now.
                placed();
                setStep({
                    kind: "placed",
                    started,
                    toPay:
                        request.fulfilment === "PICKUP"
                            ? "Pay when you collect"
                            : "Pay on delivery",
                });
                return;
            }
            setStep({
                kind: "pay",
                started: { ...started, payment: started.payment },
                request,
            });
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

    function place(request: StartCheckout, priced: BagPriced) {
        if (testRelease) {
            setStep({ kind: "test-release", priced });
            return;
        }
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
                    draft={draft}
                    onDraft={setDraft}
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

            <TestReleaseStopSheet
                open={step.kind === "test-release"}
                live={
                    step.kind === "test-release"
                        ? testStopLine(step.priced)
                        : ""
                }
                nothing="ordered"
                back="Back to your bag"
                onClose={() => setStep({ kind: "bag" })}
            />

            {step.kind === "placed" ? (
                <OrderPlacedToPay
                    started={step.started}
                    businessName={businessName}
                    soldBy={soldBy}
                    toPay={step.toPay}
                    onClose={close}
                />
            ) : null}

            {step.kind === "pay" && customer ? (
                <CheckoutPay
                    started={step.started}
                    api={api}
                    businessName={businessName}
                    soldBy={soldBy}
                    customer={customer}
                    delivery={step.request.address}
                    onPlaced={placed}
                    onConfirming={confirming}
                    onSettled={settled}
                    onBack={() => setStep({ kind: "bag" })}
                    onClose={close}
                    openCheckout={openCheckout}
                    apiUrl={apiUrl}
                />
            ) : null}
        </>
    );
}

/** "the customer signs in here and pays ₹1,240 for 3 items". */
export function testStopLine({ total, count }: BagPriced): string {
    const pays = total ? `pays ${total}` : "pays";
    return `the customer signs in here and ${pays} for ${itemsText(count)}`;
}
