"use client";

import type { LookId } from "@saroh/block-contract";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import { destructiveAlertClasses } from "../alert";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import { openProviderCheckout } from "../booking-flow/checkout";
import type { InlineCodeHandle } from "../booking-flow/inline-code";
import { InlineCode } from "../booking-flow/inline-code";
import { formatAmount } from "../lib/money";
import { pickupReadyWords } from "../lib/shop-facts";
import { usePublicVisit } from "../lib/use-public-visit";
import { cn } from "../lib/utils";
import { readQrSource } from "../qr-source";
import { SoldByLine } from "../sold-by";
import { useTestRelease } from "../test-release/context";
import { TestReleaseStopSheet } from "../test-release/test-release-stop";
import type {
    CheckoutQuote,
    CheckoutStarted,
    DeliveryAddress,
    ShopCheckoutApi,
    ShopPayment,
    ShopProblem,
    ShopWay,
    StartCheckout,
} from "./api";
import { checkoutKey, SHOP_OFFLINE } from "./api";
import { testStopLine } from "./bag";
import {
    addressBlank,
    AddressFields,
    addressLeft,
    EMPTY_ADDRESS,
    needsAddress,
    SavedAddress,
    trimmed,
} from "./bag-address";
import { onBagDraft, readBagDraft, writeBagDraft } from "./bag-draft-store";
import { lineKey } from "./bag-lines";
import type { BagDraft } from "./bag-sheet";
import {
    EMPTY_DRAFT,
    holdReason,
    MAX_ORDER_NOTE,
    notePrint,
    payChosen,
} from "./bag-sheet";
import { bagCount, clearBag, openBag, useBag } from "./bag-store";
import { STANDING_POLL_MS, STANDING_POLL_TRIES } from "./checkout-sheet";
import {
    SHOP_LABEL,
    SHOP_TITLE,
    shopChoice,
    shopDot,
    shopField,
    shopLink,
    shopPanel,
    shopPrimary,
} from "./look-shop";
import { orderConfirmationHref } from "./order-confirmation";
import { writePendingCheckout } from "./pending-checkout";

/**
 * The checkout page under a look (DEC-172, plan U11, #1102): `/checkout`,
 * the boards VA16, VD16 and VB16. Classic never comes here: its bag asks
 * and pays in its own sheet.
 *
 * ASKED ONCE, HERE. 1 · Pick-up or delivery, a real radio group with what
 * each costs and when: pick-up says "Ready from 7 am Tue 20 Oct" from the
 * business hours (no slots, no cut-off: those are Phase 2), delivery is one
 * flat fee with its free-over line, no zones or slots. 2 · Your details:
 * signed in, "Ordering as Asha · Not you?"; otherwise the email and the
 * code inside the page (`InlineCode`, U10's), with the same words for
 * every address, checked before anything is charged. No "Sign in and pay".
 * 3 · How you'll pay, when the shop takes more than one way.
 *
 * THE BUTTON FOLLOWS THE CHOICE: "Pay ₹560 and place order", or "Place
 * order · pay ₹560 at pick-up". A tap before the code is in moves to the
 * code and says so. Every amount, the GST in it included, is the server's
 * quote for the lines and the way chosen.
 *
 * PAYING says only what is known (owner, 20 Oct): the window is open; the
 * payment didn't go through; waiting for the payment to come through (a
 * UPI app still finishing); placed. Shop orders hold nothing, so there is
 * no hold and no countdown. Placed leads to the order's own page.
 *
 * What is chosen and typed is the visit's draft (`bag-draft-store.ts`),
 * shared with the header's bag: a page loaded again on the way back from
 * the email app finds it, and the same bag placed twice is one order.
 */

type Load =
    | { kind: "loading" }
    | { kind: "ready"; quote: CheckoutQuote }
    | { kind: "error"; message: string };

type Paying =
    | { kind: "idle" }
    | { kind: "starting" }
    | {
          kind: "window";
          started: CheckoutStarted;
          status: "open" | Exclude<CheckoutOutcome, "paid">;
      }
    | { kind: "confirming"; started: CheckoutStarted; tries: number }
    | { kind: "ended"; title: string; body: string };

/** Two addresses as typed, compared without case or spacing. */
export function sameAddress(a: string | null, b: string | null): boolean {
    const norm = (v: string | null) =>
        (v ?? "")
            .toLowerCase()
            .replace(/[\s,.]+/g, " ")
            .trim();
    return norm(a) !== "" && norm(a) === norm(b);
}

/** The page's title, per look's board. */
export function checkoutTitle(look: LookId, way: ShopWay | null): string {
    if (look === "quiet") return "Your order";
    if (look === "live") return "Place your order";
    return way && way !== "PICKUP" ? "Delivery and pay" : "Pick-up and pay";
}

/**
 * What the place button reads: it carries the price and follows how it is
 * paid (the word list: "Pay ₹560 and place order").
 */
export function lookPlaceLabel(input: {
    pay: ShopPayment | null;
    way: ShopWay | null;
    total: string;
    busy: boolean;
}): string {
    if (input.busy) return "Placing your order…";
    if (!input.total) return "Place order";
    if (input.pay === "ON_HANDOVER") {
        return input.way === "PICKUP"
            ? `Place order · pay ${input.total} at pick-up`
            : `Place order · pay ${input.total} on delivery`;
    }
    return `Pay ${input.total} and place order`;
}

/** The line under the button: what is charged, and when. */
export function chargeWords(
    pay: ShopPayment | null,
    way: ShopWay | null,
): string | null {
    if (pay === "ON_HANDOVER") {
        return way === "PICKUP"
            ? "Nothing is charged now. Pay at the counter when you pick it up."
            : "Nothing is charged now. Pay when it's delivered.";
    }
    if (pay === "ONLINE") {
        return "Your code is checked before anything is charged. You pay in a secure window.";
    }
    return null;
}

/** What paying says, from what is known only. Pure. */
export function payingWords(
    status: "open" | Exclude<CheckoutOutcome, "paid"> | "confirming",
    { handover }: { handover: string | null },
): { title: string; body: string; problem: boolean } {
    switch (status) {
        case "open":
            return {
                title: "Finish paying in the payment window",
                body: "It opens over this page. Your order is placed once the payment comes through.",
                problem: false,
            };
        case "confirming":
            return {
                title: "Waiting for your payment to come through",
                body: "If you paid in your UPI app, there's no need to pay again. This page moves on by itself once it's through.",
                problem: false,
            };
        case "failed":
            return {
                title: "The payment didn't go through",
                body: handover
                    ? `Nothing was taken. Try again, or choose ${handover.toLowerCase()}.`
                    : "Nothing was taken. Try again.",
                problem: true,
            };
        case "unavailable":
            return {
                title: "We couldn't open the payment window",
                body: "Check your connection and try again.",
                problem: true,
            };
        default:
            return {
                title: "The payment window closed",
                body: "Nothing was paid. Pay when you're ready.",
                problem: false,
            };
    }
}

export function LookCheckout({
    look,
    site,
    businessName,
    soldBy = null,
    api,
    account,
    apiUrl,
    openCheckout = openProviderCheckout,
    shopHref = "/shop",
}: {
    look: LookId;
    site: string;
    businessName: string;
    soldBy?: string | null;
    api: ShopCheckoutApi;
    account: {
        customer: SignedInCustomer | null;
        options: SignInOptions;
        signIn: SignInApi;
    };
    /** The public API: the visit read (hours) and the checkout's return. */
    apiUrl: string;
    openCheckout?: OpenCheckout;
    shopHref?: string;
}) {
    const ids = useId();
    const router = useRouter();
    const items = useBag(site);
    const testRelease = useTestRelease() !== null;
    const code = useRef<InlineCodeHandle>(null);
    const [customer, setCustomer] = useState(account.customer);
    const [draft, setDraft] = useState<BagDraft>(EMPTY_DRAFT);
    const [drafted, setDrafted] = useState(false);
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [round, setRound] = useState(0);
    const [paying, setPaying] = useState<Paying>({ kind: "idle" });
    const [problem, setProblem] = useState<{
        reason: ShopProblem;
        message: string;
    } | null>(null);
    const [askCode, setAskCode] = useState(false);
    const [stop, setStop] = useState<string | null>(null);
    const [source] = useState(readQrSource);
    const session = useRef<{ close: () => void } | null>(null);
    const { state: visit } = usePublicVisit({ siteId: site, apiUrl });

    // The visit's draft, read after the first paint (the server has none).
    useEffect(() => {
        /* eslint-disable-next-line react-hooks/set-state-in-effect -- restored once after hydration */
        setDraft(readBagDraft(site));
        setDrafted(true);
        // The header's bag changes the code: take it, keep the rest.
        return onBagDraft((changed) => {
            if (changed !== site) return;
            const kept = readBagDraft(site);
            setDraft((d) =>
                d.code === kept.code ? d : { ...d, code: kept.code },
            );
        });
    }, [site]);
    useEffect(() => {
        if (drafted) writeBagDraft(site, draft);
    }, [site, draft, drafted]);
    const change = (fn: (d: BagDraft) => BagDraft) => setDraft(fn);
    const way = draft.way;

    // The quote: again whenever the bag, the way or the code changes.
    const bagPrint = JSON.stringify(items);
    useEffect(() => {
        if (!drafted || items.length === 0) return;
        let live = true;
        const timer = setTimeout(() => {
            void api
                .quote({
                    lines: [...items],
                    ...(way ? { fulfilment: way } : {}),
                    ...(draft.code ? { discountCode: draft.code } : {}),
                })
                .catch(() => null)
                .then((result) => {
                    if (!live) return;
                    if (result?.ok) {
                        setLoad({ kind: "ready", quote: result.data });
                        if (!way && result.data.fulfilment) {
                            const only = result.data.fulfilment;
                            change((d) => ({ ...d, way: only }));
                        }
                    } else {
                        setLoad({
                            kind: "error",
                            message: result?.message ?? SHOP_OFFLINE,
                        });
                    }
                });
        }, 150);
        return () => {
            live = false;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the bag by value
    }, [bagPrint, way, draft.code, api, round, drafted, problem]);

    // A signed-in customer's last delivery, read out instead of typed.
    const askSaved =
        customer &&
        needsAddress(way) &&
        draft.saved === null &&
        addressBlank(draft.address)
            ? api.savedAddress
            : undefined;
    useEffect(() => {
        if (!askSaved) return;
        let live = true;
        void askSaved()
            .catch(() => null)
            .then((result) => {
                if (!live) return;
                const found = result?.ok ? result.data : null;
                change((d) => {
                    if (d.saved !== null) return d;
                    if (!found || !addressBlank(d.address))
                        return { ...d, saved: "typing" };
                    const last = { ...EMPTY_ADDRESS, ...found };
                    return {
                        ...d,
                        address: last,
                        saved: addressLeft(last) === null ? "shown" : "typing",
                    };
                });
            });
        return () => {
            live = false;
        };
    }, [askSaved]);

    // Paid in the window: ask the server until it has placed the order.
    const confirmTries = paying.kind === "confirming" ? paying.tries : null;
    useEffect(() => {
        if (paying.kind !== "confirming" || confirmTries === null) return;
        if (confirmTries >= STANDING_POLL_TRIES) return;
        const started = paying.started;
        const timer = setTimeout(
            () => {
                void api
                    .standing(started.orderId)
                    .catch(() => null)
                    .then((result) => {
                        if (result?.ok && result.data.state !== "paying") {
                            writePendingCheckout(site, null);
                            if (
                                result.data.state === "placed" ||
                                result.data.state === "to-pay"
                            ) {
                                placed(started.orderId);
                                return;
                            }
                            setPaying({
                                kind: "ended",
                                title:
                                    result.data.state === "closed"
                                        ? "This checkout has closed"
                                        : "Your money is on its way back",
                                body:
                                    result.data.message ??
                                    (result.data.state === "closed"
                                        ? "It wasn't paid in time, so nothing was ordered. Your bag is still here."
                                        : "Sorry, it sold out while you were paying."),
                            });
                            return;
                        }
                        setPaying({
                            kind: "confirming",
                            started,
                            tries: confirmTries + 1,
                        });
                    });
            },
            confirmTries === 0 ? 0 : STANDING_POLL_MS,
        );
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmTries]);

    useEffect(
        () => () => {
            session.current?.close();
            session.current = null;
        },
        [],
    );

    function placed(orderId: string) {
        clearBag(site);
        writeBagDraft(site, EMPTY_DRAFT);
        router.push(orderConfirmationHref(orderId));
    }

    const quote = load.kind === "ready" ? load.quote : null;
    const chosen = quote?.ways.find((w) => w.type === way) ?? null;
    const addressNote = needsAddress(way) ? addressLeft(draft.address) : null;
    const pays =
        quote?.payments ??
        (quote ? [{ type: "ONLINE" as const, label: "Pay online" }] : []);
    const pay = payChosen(pays, draft.pay);
    const handover = pays.find((p) => p.type === "ON_HANDOVER")?.label ?? null;
    const discount = quote?.discount ?? null;
    const applied =
        discount?.applied === true && discount.code === draft.code
            ? discount.code
            : null;
    const busy = paying.kind === "starting";
    const total = quote ? formatAmount(quote.total, quote.currency) : "";
    const held = busy
        ? null
        : holdReason({
              quote,
              way,
              addressOk: addressNote === null,
              addressNote,
              payable: pay !== null,
          });
    const canPlace =
        !!quote &&
        quote.ready &&
        quote.fulfilment === way &&
        held === null &&
        pay !== null &&
        !busy;
    const ready =
        way === "PICKUP" &&
        visit.kind === "ready" &&
        visit.visit &&
        // The business's place is the pick-up's: a second location's
        // hours are never said for the first's.
        (!quote?.pickup ||
            sameAddress(visit.visit.address, quote.pickup.address))
            ? pickupReadyWords(
                  visit.visit.hours,
                  new Date(),
                  visit.visit.timezone,
                  visit.visit.closedDates ?? [],
              )
            : null;

    function launch(started: CheckoutStarted) {
        if (!started.payment) return;
        session.current?.close();
        const phone = draft.address.phone?.replace(/[\s()-]/g, "") ?? "";
        const opened = openCheckout({
            handoff: started.payment,
            business: businessName,
            description: `Order ${started.orderNumber}`,
            booker: {
                name:
                    [customer?.name, draft.address.name]
                        .map((n) => n?.trim() ?? "")
                        .find((n) => n !== "") ?? "",
                email: customer?.email ?? "",
                ...(phone ? { phone } : {}),
            },
            apiUrl,
        });
        session.current = opened;
        setPaying({ kind: "window", started, status: "open" });
        void opened.outcome.then((outcome) => {
            if (session.current !== opened) return;
            if (outcome === "paid") {
                writePendingCheckout(site, started.orderId);
                setPaying({ kind: "confirming", started, tries: 0 });
            } else {
                setPaying({ kind: "window", started, status: outcome });
            }
        });
    }

    async function place() {
        if (!quote || !way) return;
        if (!customer) {
            // The code comes first: nothing is placed, nothing charged.
            setAskCode(true);
            code.current?.press();
            return;
        }
        if (!canPlace) return;
        const body: Omit<StartCheckout, "key"> = {
            lines: [...items],
            fulfilment: way,
            ...(needsAddress(way) ? { address: trimmed(draft.address) } : {}),
            ...(pay.type === "ON_HANDOVER" ? { payment: pay.type } : {}),
            ...(draft.note.trim() ? { notes: draft.note.trim() } : {}),
            ...(applied ? { discountCode: applied } : {}),
        };
        if (testRelease) {
            setStop(testStopLine({ total, count: bagCount(items) }));
            return;
        }
        const print = JSON.stringify({
            ...body,
            ...(body.notes ? { notes: notePrint(body.notes) } : {}),
        });
        const checkout =
            draft.checkout?.print === print
                ? draft.checkout
                : { print, key: checkoutKey() };
        if (checkout !== draft.checkout) change((d) => ({ ...d, checkout }));
        setPaying({ kind: "starting" });
        setProblem(null);
        const request: StartCheckout = {
            ...body,
            key: checkout.key,
            ...(source ? { source } : {}),
        };
        const result = await api.start(request).catch(() => ({
            ok: false as const,
            reason: "error" as const,
            message: SHOP_OFFLINE,
        }));
        if (result.ok) {
            if (result.data.payment === null) {
                placed(result.data.orderId);
                return;
            }
            launch(result.data);
            return;
        }
        setPaying({ kind: "idle" });
        if (result.reason === "signed-out") {
            setCustomer(null);
            setAskCode(true);
            setProblem({
                reason: result.reason,
                message:
                    "Confirm your email again with a code to place your order.",
            });
            return;
        }
        setProblem(result);
    }

    if (drafted && items.length === 0 && paying.kind === "idle") {
        return (
            <section className="max-w-site-content mx-auto w-full px-[var(--site-page-margin,20px)] py-[var(--site-section-padding,64px)]">
                <h1 className={SHOP_TITLE[look]}>Your bag is empty</h1>
                <p className="text-site-body mt-4 text-[16px]">
                    Add something from the shop, then check out here.
                </p>
                <a href={shopHref} className={cn(shopPrimary(), "mt-6")}>
                    Back to the shop
                </a>
            </section>
        );
    }

    const label = lookPlaceLabel({ pay: pay?.type ?? null, way, total, busy });
    const charge = chargeWords(pay?.type ?? null, way);
    const placeButton = (where: "aside" | "bar") => (
        <button
            type="button"
            onClick={() => void place()}
            disabled={!canPlace && !!customer}
            aria-describedby={held ? `${ids}-held` : undefined}
            data-site-primary=""
            data-place-order={where}
            className={cn(
                shopPrimary(!canPlace && !!customer),
                "w-full",
                where === "aside" ? "max-[699px]:hidden" : "min-[700px]:hidden",
            )}
        >
            {label}
        </button>
    );

    const windowState =
        paying.kind === "window"
            ? paying.status
            : paying.kind === "confirming"
              ? "confirming"
              : null;
    const words = windowState ? payingWords(windowState, { handover }) : null;

    return (
        <section
            data-look-checkout={look}
            className="max-w-site-content mx-auto w-full px-[var(--site-page-margin,20px)] pb-[var(--site-section-padding,64px)] pt-10 max-[699px]:pb-36"
        >
            <h1
                className={cn(
                    SHOP_TITLE[look],
                    look === "quiet" && "min-[700px]:text-center",
                )}
            >
                {checkoutTitle(look, way)}
            </h1>

            <div className="mt-10 grid gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_400px] min-[1000px]:items-start">
                <div className="grid min-w-0 gap-10">
                    {/* 1 · Pick-up or delivery, asked once, here. */}
                    <section
                        aria-labelledby={`${ids}-way`}
                        className={
                            look === "live"
                                ? cn(shopPanel(look), "p-5")
                                : undefined
                        }
                    >
                        <h2 id={`${ids}-way`} className={SHOP_LABEL}>
                            1 · Pick-up or delivery
                        </h2>
                        {load.kind === "error" ? (
                            <div className="mt-3">
                                <p
                                    role="alert"
                                    className={destructiveAlertClasses}
                                >
                                    {load.message}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLoad({ kind: "loading" });
                                        setRound((r) => r + 1);
                                    }}
                                    className={shopLink}
                                >
                                    Try again
                                </button>
                            </div>
                        ) : !quote ? (
                            <p
                                role="status"
                                className="text-site-body mt-3 min-h-14 text-sm"
                            >
                                Checking prices…
                            </p>
                        ) : quote.ways.length === 0 ? (
                            <p className="text-site-body mt-3 text-[15px]">
                                These can't be ordered together. Take one out of
                                your bag to see how the rest can reach you.
                            </p>
                        ) : (
                            <div
                                role="radiogroup"
                                aria-labelledby={`${ids}-way`}
                                className="mt-3 grid gap-2 min-[700px]:grid-cols-2"
                            >
                                {quote.ways.map((w) => {
                                    const on = way === w.type;
                                    return (
                                        <button
                                            key={w.type}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() =>
                                                change((d) => ({
                                                    ...d,
                                                    way: w.type,
                                                }))
                                            }
                                            className={shopChoice(on)}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={shopDot(on)}
                                            >
                                                {on ? (
                                                    <span className="bg-site-fg size-2.5 rounded-full" />
                                                ) : null}
                                            </span>
                                            <span className="grid min-w-0 flex-1 gap-0.5">
                                                <span className="flex gap-3 text-[16px] font-semibold">
                                                    <span className="flex-1">
                                                        {w.label}
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {w.fee
                                                            ? formatAmount(
                                                                  w.fee,
                                                                  quote.currency,
                                                              )
                                                            : "Free"}
                                                    </span>
                                                </span>
                                                {w.type !== "PICKUP" &&
                                                w.fee &&
                                                quote.freeDelivery?.over ? (
                                                    <span className="text-site-body text-[13.5px]">
                                                        Free over{" "}
                                                        {formatAmount(
                                                            quote.freeDelivery
                                                                .over,
                                                            quote.currency,
                                                        )}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {quote && way === "PICKUP" && quote.pickup ? (
                            <p
                                data-pickup-ready=""
                                className="text-site-body mt-3 min-h-6 text-[15px] leading-relaxed"
                            >
                                {ready ? (
                                    <span className="text-site-fg font-semibold">
                                        {ready}{" "}
                                    </span>
                                ) : null}
                                At {quote.pickup.address}.{" "}
                                {!ready && quote.pickup.hours
                                    ? `Open ${quote.pickup.hours}. `
                                    : null}
                                We'll email you when it's ready.
                            </p>
                        ) : null}
                        {quote && needsAddress(way) ? (
                            <fieldset className="mt-5">
                                <legend className={SHOP_LABEL}>
                                    Deliver to
                                </legend>
                                {askSaved ? (
                                    <p
                                        role="status"
                                        className="text-site-body mt-2 text-sm"
                                    >
                                        Looking for your last address…
                                    </p>
                                ) : draft.saved === "shown" ? (
                                    <SavedAddress
                                        address={draft.address}
                                        onDifferent={() =>
                                            change((d) => ({
                                                ...d,
                                                address: EMPTY_ADDRESS,
                                                saved: "typing",
                                            }))
                                        }
                                    />
                                ) : (
                                    <AddressFields
                                        site={site}
                                        address={draft.address}
                                        onChange={(
                                                name: keyof DeliveryAddress,
                                            ) =>
                                            (value: string) =>
                                                change((d) => ({
                                                    ...d,
                                                    address: {
                                                        ...d.address,
                                                        [name]: value,
                                                    },
                                                }))
                                            }
                                    />
                                )}
                                <p className="text-site-body mt-2 text-[13.5px]">
                                    We'll email you when it's on its way.
                                </p>
                            </fieldset>
                        ) : null}
                    </section>

                    {/* 2 · Your details: the code for every email. */}
                    <section
                        aria-labelledby={`${ids}-you`}
                        className={
                            look === "live"
                                ? cn(shopPanel(look), "p-5")
                                : undefined
                        }
                    >
                        <h2 id={`${ids}-you`} className={SHOP_LABEL}>
                            2 · Your details
                        </h2>
                        {customer ? (
                            <p
                                data-ordering-as=""
                                className="text-site-fg mt-3 flex flex-wrap items-center gap-x-3 text-[15.5px]"
                            >
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    Ordering as{" "}
                                    <b className="font-semibold">
                                        {customer.name?.trim()
                                            ? customer.name.trim()
                                            : customer.email}
                                    </b>
                                    {customer.name?.trim() ? (
                                        <span className="text-site-body">
                                            {" "}
                                            · {customer.email}
                                        </span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCustomer(null)}
                                    className={shopLink}
                                >
                                    Not you?
                                </button>
                            </p>
                        ) : (
                            <>
                                <InlineCode
                                    ids={ids}
                                    options={account.options}
                                    api={account.signIn}
                                    handle={code}
                                    onSignedIn={(who) => {
                                        setCustomer(who);
                                        setAskCode(false);
                                        setProblem(null);
                                    }}
                                />
                                {askCode ? (
                                    <p
                                        role="status"
                                        className="text-site-fg mt-2 text-[14px] font-semibold"
                                    >
                                        Enter the code we sent to place your
                                        order.
                                    </p>
                                ) : null}
                            </>
                        )}
                        <label className="mt-5 block text-[14px] font-semibold">
                            Note for {businessName}{" "}
                            <span className="text-site-body font-normal">
                                (optional)
                            </span>
                            <textarea
                                rows={2}
                                maxLength={MAX_ORDER_NOTE}
                                value={draft.note}
                                onChange={(e) =>
                                    change((d) => ({
                                        ...d,
                                        note: e.target.value,
                                    }))
                                }
                                placeholder="A gift message, or anything they should know"
                                className={cn(
                                    shopField,
                                    "mt-1.5 h-auto min-h-20 resize-y py-3 font-normal",
                                )}
                            />
                        </label>
                    </section>

                    {/* 3 · How you'll pay. */}
                    {quote && pays.length > 0 ? (
                        <section
                            aria-labelledby={`${ids}-pay`}
                            className={
                                look === "live"
                                    ? cn(shopPanel(look), "p-5")
                                    : undefined
                            }
                        >
                            <h2 id={`${ids}-pay`} className={SHOP_LABEL}>
                                3 · How you'll pay
                            </h2>
                            {pays.length > 1 ? (
                                <div
                                    role="radiogroup"
                                    aria-labelledby={`${ids}-pay`}
                                    className="mt-3 grid gap-2 min-[700px]:grid-cols-2"
                                >
                                    {pays.map((p) => {
                                        const on = pay?.type === p.type;
                                        return (
                                            <button
                                                key={p.type}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                onClick={() =>
                                                    change((d) => ({
                                                        ...d,
                                                        pay: p.type,
                                                    }))
                                                }
                                                className={shopChoice(on)}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={shopDot(on)}
                                                >
                                                    {on ? (
                                                        <span className="bg-site-fg size-2.5 rounded-full" />
                                                    ) : null}
                                                </span>
                                                <span className="grid gap-0.5">
                                                    <span className="text-[16px] font-semibold">
                                                        {p.label}
                                                    </span>
                                                    <span className="text-site-body text-[13.5px]">
                                                        {p.type === "ONLINE"
                                                            ? "In a secure payment window"
                                                            : way === "PICKUP"
                                                              ? "At the counter when you pick it up"
                                                              : "When it's delivered"}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-site-body mt-3 text-[15px]">
                                    {pays[0]?.label}.
                                </p>
                            )}
                        </section>
                    ) : null}
                </div>

                {/* Your order: the lines, the way, the total and the button. */}
                <aside
                    aria-labelledby={`${ids}-order`}
                    className={cn(
                        "min-w-0 p-6 min-[1000px]:sticky min-[1000px]:top-24",
                        look === "quiet"
                            ? "border-site-fg border-t px-0"
                            : shopPanel(look),
                    )}
                >
                    <h2 id={`${ids}-order`} className={SHOP_LABEL}>
                        Your order
                    </h2>
                    {quote ? (
                        <dl className="mt-3 text-[15px]">
                            {quote.lines
                                .filter((l) => l.state !== "gone")
                                .map((l) => (
                                    <div
                                        key={lineKey(l)}
                                        className="border-site-border flex gap-3 border-b border-dotted py-3"
                                    >
                                        <dt className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                            {l.quantity} × {l.name}
                                            {l.variantTitle
                                                ? `, ${l.variantTitle.toLowerCase()}`
                                                : ""}
                                        </dt>
                                        <dd className="tabular-nums">
                                            {formatAmount(
                                                l.amount,
                                                quote.currency,
                                            )}
                                        </dd>
                                    </div>
                                ))}
                            {applied && discount?.applied ? (
                                <div className="border-site-border flex gap-3 border-b border-dotted py-3">
                                    <dt className="flex-1">
                                        Code {discount.code}
                                    </dt>
                                    <dd className="tabular-nums">
                                        −
                                        {formatAmount(
                                            discount.amount,
                                            quote.currency,
                                        )}
                                    </dd>
                                </div>
                            ) : null}
                            {chosen ? (
                                <div className="border-site-border flex gap-3 border-b border-dotted py-3">
                                    <dt className="flex-1">{chosen.label}</dt>
                                    <dd className="tabular-nums">
                                        {chosen.fee
                                            ? formatAmount(
                                                  chosen.fee,
                                                  quote.currency,
                                              )
                                            : "Free"}
                                    </dd>
                                </div>
                            ) : null}
                            <div className="flex items-baseline gap-3 pt-4">
                                <dt className="flex-1 text-[17px] font-semibold">
                                    Total
                                </dt>
                                <dd
                                    data-checkout-total=""
                                    className="font-site-heading text-[calc(1.75rem*var(--site-heading-scale,1))] tabular-nums"
                                >
                                    {total}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <p
                            role="status"
                            className="text-site-body mt-3 text-sm"
                        >
                            Checking prices…
                        </p>
                    )}
                    <p className="text-site-body mt-1 text-[13.5px]">
                        {quote?.gst
                            ? `Includes ${formatAmount(quote.gst, quote.currency)} GST. `
                            : null}
                        <button
                            type="button"
                            onClick={openBag}
                            className={cn(shopLink, "min-h-11 text-[13.5px]")}
                        >
                            Edit bag
                        </button>
                    </p>

                    {problem ? (
                        <p
                            role="alert"
                            className={cn(destructiveAlertClasses, "mt-3")}
                        >
                            {problem.message}
                        </p>
                    ) : null}
                    {held && !problem ? (
                        <p
                            id={`${ids}-held`}
                            className="text-site-fg mt-3 text-[14px] font-semibold"
                        >
                            {held}
                        </p>
                    ) : null}

                    {words ? (
                        <div
                            role={words.problem ? "alert" : "status"}
                            data-paying={windowState ?? ""}
                            className="border-site-border mt-4 border-t pt-4"
                        >
                            <p className="text-site-fg text-[16px] font-semibold">
                                {words.title}
                            </p>
                            <p className="text-site-body mt-1 text-[14px] leading-normal">
                                {words.body}
                            </p>
                            {paying.kind === "window" &&
                            paying.status !== "open" ? (
                                <button
                                    type="button"
                                    onClick={() => launch(paying.started)}
                                    className={cn(shopPrimary(), "mt-3 w-full")}
                                >
                                    Pay{" "}
                                    {formatAmount(
                                        paying.started.total,
                                        paying.started.currency,
                                    )}
                                </button>
                            ) : null}
                        </div>
                    ) : paying.kind === "ended" ? (
                        <div
                            role="status"
                            className="border-site-border mt-4 border-t pt-4"
                        >
                            <p className="text-site-fg text-[16px] font-semibold">
                                {paying.title}
                            </p>
                            <p className="text-site-body mt-1 text-[14px]">
                                {paying.body}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4">{placeButton("aside")}</div>
                    )}
                    {charge && !words ? (
                        <p className="text-site-body mt-3 text-[13.5px] leading-normal">
                            {charge}
                        </p>
                    ) : null}
                    <SoldByLine
                        line={soldBy}
                        className="text-site-muted mt-4"
                    />
                </aside>
            </div>

            {/* The phone's one fixed bar: the place button at the thumb. */}
            {!words && paying.kind !== "ended" ? (
                <div className="bg-site-bg border-site-border fixed inset-x-0 bottom-[var(--site-consent-offset,0px)] z-40 border-t px-[var(--site-page-margin,16px)] pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 min-[700px]:hidden">
                    {placeButton("bar")}
                </div>
            ) : null}

            <TestReleaseStopSheet
                open={stop !== null}
                live={stop ?? ""}
                nothing="ordered"
                back="Back to your order"
                onClose={() => setStop(null)}
            />
        </section>
    );
}
