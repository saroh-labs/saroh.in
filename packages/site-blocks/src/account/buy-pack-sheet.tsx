"use client";

import { useEffect, useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import { PayOption } from "../booking-flow/steps/pay-option";
import { gstUnderWords } from "../lib/gst-price";
import { cn } from "../lib/utils";
import type { PackKind } from "../prices/pack-words";
import { packPayPrice } from "../prices/pack-words";
import { NOT_TAKING_ORDERS_TEXT } from "../shop/not-taking-orders";
import { accountMoney } from "./model";
import type {
    AccountPackCheckout,
    AccountPackOnSale,
    AccountPacksOnSale,
    PacksApi,
} from "./packs-api";
import {
    boughtMessage,
    classesText,
    PACKS_OFFLINE,
    packTermsLine,
} from "./packs-api";
import { Sheet, sheetAltButton, sheetButton } from "./sheet";

/**
 * Buy a class pack from the account (round-2 plan A, A11; Saroh Customer
 * Site design, the pack sheet): the pack's name, "10 credits to use within
 * 60 days.", its price, and "Buy · ₹4,500". With several packs on sale the
 * customer picks one in the same sheet — no extra step.
 *
 * Buying opens the business's own provider window on a payment the server
 * priced. Saroh never names or limits the ways to pay (DEC-059): the window
 * shows what the business's account has switched on. What the window says
 * is only a hint: "paid" there starts the wait for the server, which makes
 * the pack only when the provider's webhook arrives, so the sheet asks how
 * the payment stands until it says bought. Closing the window, or a
 * refusal, offers another go on the same payment.
 *
 * A business that takes no payment online sells packs at the desk: the
 * sheet says so, and has no pay button.
 *
 * **GST is said before paying.** Every amount here is the amount to pay,
 * and where the pack (or the started payment) carries `gst`, the line
 * under the price says the GST in or on it: "Includes ₹686.44 GST (18%)",
 * or "₹4,500 + ₹810 GST (18%)" under ₹5,310.
 */

/** How often, and how long, the sheet asks whether the payment landed. */
export const PACK_POLL_MS = 2_000;
export const PACK_POLL_TRIES = 30;

type Phase =
    | { kind: "choose" }
    | {
          kind: "window";
          started: AccountPackCheckout;
          status: "open" | CheckoutOutcome;
      }
    | { kind: "confirming"; started: AccountPackCheckout; tries: number }
    | { kind: "closed"; started: AccountPackCheckout };

export interface BuyPackSheetProps {
    open: boolean;
    onClose: () => void;
    onSale: AccountPacksOnSale;
    businessName: string;
    customer: { name: string | null; email: string };
    api: PacksApi;
    /** The pack is on the account: say so and read the tab again. */
    onBought: (message: string) => void;
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
    /** Where the window's return is posted, so paying moves on at once (P1). */
    apiUrl?: string;
}

export function BuyPackSheet(props: BuyPackSheetProps) {
    const { open, onClose, onSale } = props;
    const single = onSale.packs.length === 1 ? onSale.packs[0] : null;
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={single ? single.name : "Buy a pack"}
            lead={single ? packTermsLine(single) : undefined}
        >
            {/* Keyed on opening, so each opening starts fresh. */}
            {open ? <BuyPack {...props} /> : null}
        </Sheet>
    );
}

function newKey(): string {
    const random =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `pack-${random}`;
}

function BuyPack({
    onSale,
    businessName,
    customer,
    api,
    onBought,
    onClose,
    openCheckout = openProviderCheckout,
    apiUrl,
}: BuyPackSheetProps) {
    const [chosen, setChosen] = useState<AccountPackOnSale | null>(
        onSale.packs[0] ?? null,
    );
    const [phase, setPhase] = useState<Phase>({ kind: "choose" });
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const session = useRef<{ close: () => void } | null>(null);
    // One key per pack for this opening: a retry replays the same payment.
    const keys = useRef(new Map<string, string>());
    // Classes or sessions, for the words once the pack being paid for lands.
    const buyingKind = useRef<PackKind | undefined>(undefined);

    function launch(started: AccountPackCheckout, kind: PackKind | undefined) {
        session.current?.close();
        buyingKind.current = kind;
        const opened = openCheckout({
            handoff: started.payment,
            business: businessName,
            description: `${started.pack.name} · ${classesText(started.pack.credits, kind)}`,
            booker: { name: customer.name ?? "", email: customer.email },
            apiUrl,
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

    async function buy() {
        if (!chosen || busy) return;
        setBusy(true);
        setProblem(null);
        let key = keys.current.get(chosen.ref);
        if (!key) {
            key = newKey();
            keys.current.set(chosen.ref, key);
        }
        const result = await api
            .buy(chosen.ref, key)
            .catch(() => ({ ok: false as const, message: PACKS_OFFLINE }));
        setBusy(false);
        if (result.ok) launch(result.data, chosen.kind);
        else setProblem(result.message);
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
    const latest = useRef({ api, onBought });
    useEffect(() => {
        latest.current = { api, onBought };
    });

    // Paid in the window: ask the server until it says bought (or closed).
    useEffect(() => {
        if (phase.kind !== "confirming" || phase.tries >= PACK_POLL_TRIES) {
            return;
        }
        const { started, tries } = phase;
        const timer = setTimeout(
            () => {
                void latest.current.api
                    .standing(started.ref)
                    .catch(() => null)
                    .then((result) => {
                        if (result?.ok && result.data.state === "bought") {
                            latest.current.onBought(
                                boughtMessage(
                                    result.data.pack.name,
                                    buyingKind.current,
                                ),
                            );
                            return;
                        }
                        setPhase(
                            result?.ok && result.data.state === "closed"
                                ? { kind: "closed", started }
                                : {
                                      kind: "confirming",
                                      started,
                                      tries: tries + 1,
                                  },
                        );
                    });
            },
            tries === 0 ? 0 : PACK_POLL_MS,
        );
        return () => clearTimeout(timer);
    }, [phase]);

    if (onSale.notTakingOrders) {
        return (
            <>
                <p
                    role="status"
                    className="text-site-body mt-3 text-sm leading-normal"
                >
                    {NOT_TAKING_ORDERS_TEXT}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className={sheetButton(false)}
                >
                    OK
                </button>
            </>
        );
    }

    if (!onSale.payOnline) {
        return (
            <>
                <p className="text-site-body mt-3 text-sm leading-normal">
                    {businessName} sells packs at the desk. Your credits start
                    when you pay there.
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className={sheetButton(false)}
                >
                    OK
                </button>
            </>
        );
    }

    if (phase.kind === "confirming") {
        const late = phase.tries >= PACK_POLL_TRIES;
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
                        ? "This is taking longer than usual. You can close this. Your pack shows on this page as soon as the payment is confirmed."
                        : "Hold on a moment while we confirm it with the payment provider."}
                </p>
                <p className="text-site-muted mt-3 text-sm">
                    {phase.started.pack.name} ·{" "}
                    {accountMoney(phase.started.total, phase.started.currency)}
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
                    This payment has closed, so nothing was bought. Start again
                    to buy the pack.
                </p>
                <button
                    type="button"
                    onClick={() => setPhase({ kind: "choose" })}
                    className={sheetButton(false)}
                >
                    Start again
                </button>
            </>
        );
    }

    const pack = chosen;
    // What the pack costs to pay, and the GST in or on it: the server's own
    // sum once the payment has started, else the pack's as it is listed.
    // The API's numbers; nothing is added up here.
    const underWay = phase.kind === "window" ? phase.started : null;
    const total = underWay
        ? accountMoney(underWay.total, underWay.currency)
        : pack
          ? packPayPrice(pack)
          : null;
    const gstLine = underWay
        ? gstUnderWords(underWay.gst, underWay.currency)
        : pack
          ? gstUnderWords(pack.gst, pack.currency)
          : null;
    const windowStatus = phase.kind === "window" ? phase.status : null;
    const windowOpen = windowStatus === "open";
    const windowProblem =
        windowStatus === "failed"
            ? "The payment didn't go through. Nothing was taken. Try again."
            : windowStatus === "unavailable"
              ? "We couldn't open the payment window. Try again in a moment."
              : null;
    const off = !pack || busy || windowOpen;

    return (
        <>
            {onSale.packs.length > 1 ? (
                <>
                    <div
                        id="buy-pack-choice"
                        className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]"
                    >
                        Pack
                    </div>
                    <div
                        role="radiogroup"
                        aria-labelledby="buy-pack-choice"
                        className="grid gap-1.5"
                    >
                        {onSale.packs.map((p) => (
                            <PayOption
                                key={p.ref}
                                on={pack?.ref === p.ref}
                                label={p.name}
                                sub={`${classesText(p.credits, p.kind)} · use within ${p.validityDays} days · ${packPayPrice(p)}`}
                                onPick={() => {
                                    if (phase.kind === "window") return;
                                    setChosen(p);
                                    setProblem(null);
                                }}
                            />
                        ))}
                    </div>
                    {pack?.description ? (
                        <p className="text-site-body mt-2.5 text-sm leading-normal">
                            {pack.description}
                        </p>
                    ) : null}
                </>
            ) : pack?.description ? (
                <p className="text-site-body mt-2 text-sm leading-normal">
                    {pack.description}
                </p>
            ) : null}
            {pack && total ? (
                <div className="border-site-border mt-3 flex items-center gap-2.5 border-t py-2.5 text-sm">
                    <span className="min-w-0 flex-1">Price</span>
                    {gstLine ? (
                        <span className="text-right">
                            <span className="block font-semibold tabular-nums">
                                {total}
                            </span>
                            <span
                                data-price-gst=""
                                className="text-site-muted block text-xs tabular-nums"
                            >
                                {gstLine}
                            </span>
                        </span>
                    ) : (
                        <span className="font-semibold tabular-nums">
                            {total}
                        </span>
                    )}
                </div>
            ) : null}
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
                    phase.kind === "window" && phase.started.ref
                        ? launch(phase.started, buyingKind.current)
                        : void buy()
                }
                className={sheetButton(off)}
            >
                {windowOpen
                    ? "Payment window open…"
                    : busy
                      ? "Starting…"
                      : total
                        ? `Buy · ${total}`
                        : "Buy"}
            </button>
            {phase.kind === "window" && !windowOpen ? (
                <button
                    type="button"
                    onClick={() => {
                        session.current?.close();
                        session.current = null;
                        if (onSale.packs.length > 1) {
                            setPhase({ kind: "choose" });
                        } else {
                            onClose();
                        }
                    }}
                    className={sheetAltButton}
                >
                    {onSale.packs.length > 1
                        ? "Choose another pack"
                        : "Not now"}
                </button>
            ) : null}
            <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                You pay {businessName} in a secure payment window. Your credits
                start when the payment goes through.
            </p>
        </>
    );
}
