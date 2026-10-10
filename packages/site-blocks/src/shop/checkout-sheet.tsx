"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { SignedInCustomer } from "../account/api";
import { destructiveAlertClasses } from "../alert";
import type { PaymentHandoff } from "../booking-flow/api";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";
import { SoldByLine } from "../sold-by";
import type {
    CheckoutStanding,
    CheckoutStarted,
    DeliveryAddress,
    ShopCheckoutApi,
} from "./api";
import { orderConfirmationHref, toPayLead } from "./order-confirmation";
import { SheetFrame, sheetAltButton, sheetButton } from "./sheet-frame";

/**
 * Paying for a started checkout (round-2 G13). The order exists, unpaid and
 * holding nothing; this opens the business's own provider window on its
 * intent. Saroh never names or limits the ways to pay (DEC-059): the window
 * shows what the business's account has switched on.
 *
 * What the window says is only a hint. "Paid" there starts the wait for the
 * server: the order is placed only when the payment's webhook has held its
 * items, so the sheet polls how the checkout stands and says so. If the
 * last one sold while they paid, the server has refunded it, and the sheet
 * says that (DEC-032). Closing the window, or a refusal, offers another go
 * on the same order.
 */

/** How often, and how long, the sheet asks whether the payment landed. */
export const STANDING_POLL_MS = 2_000;
export const STANDING_POLL_TRIES = 30;

type Phase =
    | { kind: "window"; status: "open" | CheckoutOutcome }
    | { kind: "confirming"; tries: number }
    | { kind: "done"; standing: CheckoutStanding };

/** A started checkout paid online: its provider window to open. */
export type OnlineStarted = CheckoutStarted & { payment: PaymentHandoff };

/**
 * An order placed to be paid at the handover ("Pay when you collect", "Pay
 * on delivery"): nothing to pay now, so the sheet says it is placed and
 * still to be paid, and leads to its confirmation page.
 */
export function OrderPlacedToPay({
    started,
    businessName,
    soldBy = null,
    toPay,
    onClose,
}: {
    started: CheckoutStarted;
    businessName: string;
    /** "Sold by ‹legal name›" (DEC-118); null draws none. */
    soldBy?: string | null;
    /** "Pay when you collect" or "Pay on delivery", as the bag offered it. */
    toPay: string;
    onClose: () => void;
}) {
    const total = formatAmount(started.total, started.currency);
    return (
        <SheetFrame
            title="Order placed"
            lead={`Order ${started.orderNumber} · ${total}. ${toPayLead(toPay)} ${businessName} will be in touch when it's ready.`}
            onClose={onClose}
        >
            <Link
                href={orderConfirmationHref(started.orderId)}
                onClick={onClose}
                className={cn(
                    sheetButton(false),
                    "flex items-center justify-center",
                )}
            >
                See your order
            </Link>
            <button type="button" onClick={onClose} className={sheetAltButton}>
                Done
            </button>
            <SoldByLine
                line={soldBy}
                className="text-site-muted mt-3 text-center"
            />
        </SheetFrame>
    );
}

export function CheckoutPay({
    started,
    api,
    businessName,
    soldBy = null,
    customer,
    delivery,
    onPlaced,
    onConfirming,
    onSettled,
    onBack,
    onClose,
    openCheckout = openProviderCheckout,
    apiUrl,
}: {
    started: OnlineStarted;
    api: ShopCheckoutApi;
    businessName: string;
    /** "Sold by ‹legal name›" (DEC-118); null draws none. */
    soldBy?: string | null;
    customer: SignedInCustomer;
    /**
     * Where it goes, as typed in the bag: its name and phone fill the
     * window's, so the customer isn't asked for them twice.
     */
    delivery?: DeliveryAddress;
    /** The order is placed: empty the bag. */
    onPlaced: () => void;
    /**
     * Paid in the window, and being confirmed: the bag keeps asking about
     * this order if the sheet is closed before the answer comes.
     */
    onConfirming?: (orderId: string) => void;
    /** The server answered how it stands (placed, refunded or closed). */
    onSettled?: () => void;
    /** Back to the bag, to change it. */
    onBack: () => void;
    onClose: () => void;
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
    /** Where the window's return is posted, so paying moves on at once (P1). */
    apiUrl?: string;
}) {
    const [phase, setPhase] = useState<Phase>({
        kind: "window",
        status: "open",
    });
    const session = useRef<{ close: () => void } | null>(null);
    const total = formatAmount(started.total, started.currency);

    const phone = delivery?.phone?.replace(/[\s()-]/g, "") ?? "";

    function launch() {
        session.current?.close();
        const opened = openCheckout({
            handoff: started.payment,
            business: businessName,
            description: `Order ${started.orderNumber}`,
            booker: {
                name:
                    [customer.name, delivery?.name]
                        .map((n) => n?.trim() ?? "")
                        .find((n) => n !== "") ?? "",
                email: customer.email,
                // "98450 12345" as typed; the window wants the digits.
                ...(phone ? { phone } : {}),
            },
            apiUrl,
        });
        session.current = opened;
        void opened.outcome.then((outcome) => {
            if (session.current !== opened) return;
            if (outcome === "paid") onConfirming?.(started.orderId);
            setPhase(
                outcome === "paid"
                    ? { kind: "confirming", tries: 0 }
                    : { kind: "window", status: outcome },
            );
        });
    }

    /** Open the window again: after a close or a refusal. */
    function open() {
        setPhase({ kind: "window", status: "open" });
        launch();
    }

    // The window opens as soon as the sheet does; leaving closes it.
    useEffect(() => {
        launch();
        return () => {
            session.current?.close();
            session.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for this checkout
    }, [started.orderId]);

    // Paid: ask the server until it has placed (or refunded) the order.
    const confirming = phase.kind === "confirming" ? phase.tries : null;
    useEffect(() => {
        if (confirming === null || confirming >= STANDING_POLL_TRIES) return;
        const timer = setTimeout(
            () => {
                void api
                    .standing(started.orderId)
                    .catch(() => null)
                    .then((result) => {
                        if (result?.ok && result.data.state !== "paying") {
                            if (result.data.state === "placed") onPlaced();
                            onSettled?.();
                            setPhase({ kind: "done", standing: result.data });
                            return;
                        }
                        setPhase({ kind: "confirming", tries: confirming + 1 });
                    });
            },
            confirming === 0 ? 0 : STANDING_POLL_MS,
        );
        return () => clearTimeout(timer);
    }, [confirming, api, started.orderId, onPlaced, onSettled]);

    if (phase.kind === "done") {
        const s = phase.standing;
        if (s.state === "placed") {
            return (
                <SheetFrame
                    title="Order placed"
                    lead={`Order ${s.orderNumber} · ${formatAmount(s.total, s.currency)}. ${businessName} will be in touch when it's ready.`}
                    onClose={onClose}
                >
                    {/* The confirmation page, on the business's own site (P4). */}
                    <Link
                        href={orderConfirmationHref(started.orderId)}
                        onClick={onClose}
                        className={cn(
                            sheetButton(false),
                            "flex items-center justify-center",
                        )}
                    >
                        See your order
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className={sheetAltButton}
                    >
                        Done
                    </button>
                    <SoldByLine
                        line={soldBy}
                        className="text-site-muted mt-3 text-center"
                    />
                </SheetFrame>
            );
        }
        // "On its way back" only once the provider has the refund; until
        // then it is owed and being sent (DEC-026).
        const words =
            s.state === "refunded"
                ? {
                      title: "Your money is on its way back",
                      lead:
                          s.message ??
                          "Sorry, it sold out while you were paying — your money is on its way back.",
                  }
                : s.state === "refunding"
                  ? {
                        title: "We're sending your money back",
                        lead:
                            s.message ??
                            "Sorry, it sold out while you were paying. We're sending your money back.",
                    }
                  : {
                        title: "This checkout has closed",
                        lead: "It wasn't paid in time, so nothing was ordered. Your bag is still here.",
                    };
        return (
            <SheetFrame title={words.title} lead={words.lead} onClose={onClose}>
                <button
                    type="button"
                    onClick={onBack}
                    className={sheetButton(false)}
                >
                    Back to your bag
                </button>
            </SheetFrame>
        );
    }

    if (phase.kind === "confirming") {
        return (
            <SheetFrame
                title="Confirming your payment"
                lead={
                    phase.tries >= STANDING_POLL_TRIES
                        ? `This is taking longer than usual. You can close this — ${businessName} gets your order as soon as the payment is confirmed.`
                        : "Hold on a moment while we confirm it with the payment provider."
                }
                onClose={onClose}
            >
                <p role="status" className="text-site-muted mt-3 text-sm">
                    Order {started.orderNumber} · {total}
                </p>
            </SheetFrame>
        );
    }

    const status = phase.status;
    const problem =
        status === "failed"
            ? "The payment didn't go through. Nothing was taken — try again."
            : status === "unavailable"
              ? "We couldn't open the payment window. Try again in a moment."
              : status === "closed"
                ? "The payment window closed before you paid."
                : null;
    return (
        <SheetFrame
            title="Pay for your order"
            lead={`Order ${started.orderNumber} · ${total}. Finish paying in the secure payment window.`}
            onClose={onClose}
        >
            {problem ? (
                <p
                    role="alert"
                    className={
                        status === "closed"
                            ? "text-site-body mt-3 text-sm"
                            : `${destructiveAlertClasses} mt-3`
                    }
                >
                    {problem}
                </p>
            ) : null}
            <button
                type="button"
                onClick={open}
                disabled={status === "open"}
                className={sheetButton(status === "open")}
            >
                {status === "open" ? "Payment window open…" : `Pay · ${total}`}
            </button>
            <button type="button" onClick={onBack} className={sheetAltButton}>
                Back to your bag
            </button>
        </SheetFrame>
    );
}
