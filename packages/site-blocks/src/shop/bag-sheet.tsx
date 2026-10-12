"use client";

import { useEffect, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import {
    focusRing,
    inputFill,
    optionClasses,
    quietFill,
} from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";
import type {
    CheckoutQuote,
    DeliveryAddress,
    QuoteLine,
    ShopCheckoutApi,
    ShopPayment,
    ShopProblem,
    ShopWay,
    StartCheckout,
} from "./api";
import { checkoutKey, SHOP_OFFLINE } from "./api";
import {
    addressBlank,
    AddressFields,
    addressLeft,
    EMPTY_ADDRESS,
    needsAddress,
    SavedAddress,
    trimmed,
} from "./bag-address";
import type { RemovedLine } from "./bag-lines";
import {
    BagLines,
    lineKey,
    lineNote,
    RemovedNotice,
    returnsLines,
} from "./bag-lines";
import type { BagItem } from "./bag-store";
import { addToBag, setQuantity } from "./bag-store";
import { cleanCode, CodeField, codeSettled } from "./code-field";
import { sheetButton, SheetFrame } from "./sheet-frame";

export { lineNote };

/**
 * "Your bag" (round-2 G13), as the Customer Site design's cart sheet draws
 * it: each line with − and + and its amount, how it leaves (Pick-up, Local
 * delivery or Shipping, with the fee), the total, and one button, named for
 * what it does (`placeLabel`): "Place order · ₹560" when signed in, and when
 * the last step is signing in, "Sign in and pay · ₹560" or "Sign in and
 * place order · ₹560".
 *
 * Every amount is the server's quote, fetched again whenever the bag or the
 * way changes: a price that moved since the item was added shows before
 * paying, and a line that can't be sold now says so and holds the button.
 *
 * How to pay comes with the quote: online, or at the handover — "Pay when
 * you collect", "Pay on delivery" — where the shop takes it (always on a
 * plan without online payments; beside online where the shop turns it on).
 * With both, the customer picks; with one, the sheet says which. Online
 * never names a method: the provider's window shows the ways the business
 * takes (DEC-059).
 */

/**
 * A note as the checkout's print carries it: a number that changes when
 * the note does, from which the note can't be read back.
 */
export function notePrint(note: string): number {
    let hash = 5381;
    for (let i = 0; i < note.length; i += 1) {
        hash = (Math.imul(hash, 33) ^ note.charCodeAt(i)) >>> 0;
    }
    return hash;
}

/** The most an order's note may run to: the API's own limit. */
export const MAX_ORDER_NOTE = 500;

type Load =
    | { kind: "loading" }
    | { kind: "ready"; quote: CheckoutQuote }
    | { kind: "error"; message: string };

/**
 * The small line under the bag's delivery row for the location's "Free
 * delivery over" (the server's `freeDelivery`): how much more makes
 * delivery free while the items are under it, or that it is free once they
 * reach it. Nothing for Pick-up, nothing when no amount is set, and no
 * nudge for a way that has no fee to waive.
 */
export function freeDeliveryNote(
    quote: Pick<CheckoutQuote, "currency" | "ways" | "freeDelivery">,
    way: ShopWay | null,
): string | null {
    const free = quote.freeDelivery;
    if (!free || way === "PICKUP") return null;
    if (free.short) {
        const charged = way
            ? quote.ways.some((w) => w.type === way && w.fee)
            : quote.ways.some((w) => w.fee);
        return charged
            ? `Add ${formatAmount(free.short, quote.currency)} more for free delivery.`
            : null;
    }
    return needsAddress(way)
        ? `Free delivery on orders of ${formatAmount(free.over, quote.currency)} or more.`
        : null;
}

/**
 * The lines asking for more than is left, and how many each can have
 * (UX-058): the bag is set to that, and says so, rather than holding the
 * button with no reason.
 */
export function overStock(
    lines: readonly QuoteLine[],
): { line: QuoteLine; left: number }[] {
    return lines.flatMap((line) =>
        line.state === "short" &&
        typeof line.available === "number" &&
        line.available > 0 &&
        line.quantity > line.available
            ? [{ line, left: line.available }]
            : [],
    );
}

/** "Only 1 left, so we've set your bag to 1." */
export function stockNotice(
    capped: readonly { line: QuoteLine; left: number }[],
): string | null {
    if (capped.length === 0) return null;
    if (capped.length === 1) {
        const { left } = capped[0];
        return `Only ${left} left, so we've set your bag to ${left}.`;
    }
    const each = capped
        .map(({ line, left }) => {
            const name = line.variantTitle
                ? `${line.name} (${line.variantTitle})`
                : line.name;
            return `${name} to ${left}`;
        })
        .join(", ");
    return `Fewer are left than you asked for, so we've set ${each}.`;
}

/**
 * Why the button is held, in a sentence beside it (UX-058): never a grey
 * button with no reason. Null when it can be placed, or while the quote
 * is still on its way.
 */
export function holdReason(input: {
    quote: CheckoutQuote | null;
    way: ShopWay | null;
    addressOk: boolean;
    /** What the address still lacks, when it is the phone and not a line. */
    addressNote?: string | null;
    payable: boolean;
}): string | null {
    const { quote, way } = input;
    if (!quote) return null;
    if (quote.lines.some((l) => l.state === "gone")) {
        return "Take out what's no longer sold to continue.";
    }
    if (quote.lines.some((l) => l.state === "sold-out")) {
        return "Take out what's sold out to continue.";
    }
    if (quote.lines.some((l) => l.state === "short")) {
        return "Fewer are left than you asked for. Lower the amount to continue.";
    }
    if (quote.ways.length === 0) return null; // said above the button already
    if (!way || quote.fulfilment !== way) {
        return "Choose how your order reaches you.";
    }
    if (!input.addressOk) {
        return input.addressNote ?? "Add the address to deliver to.";
    }
    if (!input.payable)
        return "This can't be paid for this way. Choose another.";
    return null;
}

/**
 * What the customer chose in the bag, kept by the header's bag (`ShopBag`)
 * rather than the sheet: the sheet closes whenever the checkout moves on —
 * to signing in, or to paying — and "Back to your bag", a sign-in closed or
 * a refused start must find the way and the address as they were, and
 * place the same bag under the same key (one order, not a second).
 */
export interface BagDraft {
    way: ShopWay | null;
    /** How they'll pay; null until picked (the first offered then). */
    pay: ShopPayment | null;
    address: DeliveryAddress;
    /**
     * Where `address` came from, for a signed-in customer: `shown` while it
     * is their last delivery's, read out rather than typed; `typing` once
     * they have none, or chose another ("Use a different address"), which
     * is never filled in again; null until the bag has asked.
     */
    saved: "shown" | "typing" | null;
    /**
     * "Note for ‹business›": a gift message, "no sesame", "ring the bell".
     * Optional, and sent with the order for the business to read. Kept
     * while the page is open and never written to the visit's storage
     * (`bag-draft-store.ts`): it may say something about someone's health.
     */
    note: string;
    /**
     * The discount code applied in the bag (DEC-104), as typed and tidied;
     * null for none. The quote judges it every time it prices the bag.
     */
    code: string | null;
    /** One key per request: the same bag placed again is the same order. */
    checkout: { print: string; key: string } | null;
}

/** The bag as the button priced it: "₹1,240", and how many things. */
export interface BagPriced {
    total: string;
    count: number;
}

export const EMPTY_DRAFT: BagDraft = {
    way: null,
    pay: null,
    address: EMPTY_ADDRESS,
    saved: null,
    note: "",
    code: null,
    checkout: null,
};

export function BagSheet({
    site,
    businessName,
    items,
    api,
    signedIn,
    busy,
    problem,
    draft,
    onDraft,
    onPlace,
    onClose,
}: {
    site: string;
    /** Who the note is for: "Note for Rye & Co.". */
    businessName: string;
    items: readonly BagItem[];
    api: ShopCheckoutApi;
    signedIn: boolean;
    /** A checkout is starting. */
    busy: boolean;
    /** Why the last start didn't go, in the page's words. */
    problem: { reason: ShopProblem; message: string } | null;
    /** The way, the address and the checkout key, kept above the sheet. */
    draft: BagDraft;
    onDraft: (change: (draft: BagDraft) => BagDraft) => void;
    /**
     * Place it: the request, with its key, and what the button said it
     * costs (a test release's stop names them, DEC-071).
     */
    onPlace: (request: StartCheckout, priced: BagPriced) => void;
    onClose: () => void;
}) {
    const { way, address } = draft;
    const setWay = (next: ShopWay) => onDraft((d) => ({ ...d, way: next }));
    const setPay = (next: ShopPayment) => onDraft((d) => ({ ...d, pay: next }));
    const setAddress = (change: (a: DeliveryAddress) => DeliveryAddress) =>
        onDraft((d) => ({ ...d, address: change(d.address) }));
    const setCode = (next: string | null) =>
        onDraft((d) => ({ ...d, code: next }));
    // "Have a code?" opens the field; one applied already keeps it open.
    const [codeOpen, setCodeOpen] = useState(draft.code !== null);
    const [codeInput, setCodeInput] = useState(draft.code ?? "");
    const [codeError, setCodeError] = useState<string | null>(null);
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [round, setRound] = useState(0);
    // What each line was capped at once the quote said fewer are left
    // (UX-058): "+" stops there, and the bag says why.
    const [caps, setCaps] = useState<Readonly<Record<string, number>>>({});
    const [notice, setNotice] = useState<string | null>(null);
    // The line just taken out, for "Undo".
    const [removed, setRemoved] = useState<RemovedLine | null>(null);
    const undoRemove = () => {
        if (!removed) return;
        addToBag(site, {
            listingId: removed.listingId,
            variantId: removed.variantId,
            quantity: removed.quantity,
        });
        setRemoved(null);
    };

    // Asking for more than is left: set the bag to what is, and say so.
    function capOverStock(lines: readonly QuoteLine[]) {
        const over = overStock(lines);
        if (over.length === 0) return;
        setCaps((c) => {
            const next = { ...c };
            for (const { line, left } of over) next[lineKey(line)] = left;
            return next;
        });
        setNotice(stockNotice(over));
        for (const { line, left } of over) {
            setQuantity(
                site,
                { listingId: line.listingId, variantId: line.variantId },
                left,
            );
        }
    }

    // The quote, again whenever the bag or the way changes.
    const bagPrint = JSON.stringify(items);
    useEffect(() => {
        if (items.length === 0) return;
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
                        capOverStock(result.data.lines);
                        if (!way && result.data.fulfilment) {
                            setWay(result.data.fulfilment);
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
        // A start refused because the bag changed (`problem`) prices it
        // again too.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the bag's contents, by value
    }, [bagPrint, way, api, round, problem, draft.code]);

    // A signed-in customer's last delivery, asked for once a delivery is
    // chosen: read out instead of typed again. Never over something typed.
    const askSaved =
        signedIn &&
        needsAddress(way) &&
        draft.saved === null &&
        addressBlank(address)
            ? api.savedAddress
            : undefined;
    const asksSaved = askSaved !== undefined;
    useEffect(() => {
        if (!askSaved) return;
        let live = true;
        void askSaved()
            .catch(() => null)
            .then((result) => {
                if (!live) return;
                const found = result?.ok ? result.data : null;
                onDraft((d) => {
                    if (d.saved !== null) return d;
                    if (!found || !addressBlank(d.address)) {
                        return { ...d, saved: "typing" };
                    }
                    const last = { ...EMPTY_ADDRESS, ...found };
                    // One the checkout would now send back (an older
                    // order with no phone) is filled in to be finished.
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
    }, [askSaved, onDraft]);

    if (items.length === 0) {
        return (
            <SheetFrame title="Your bag" onClose={onClose}>
                <p className="text-site-body mt-3 text-sm">
                    Your bag is empty. Add something from the shop.
                </p>
                {removed ? (
                    <RemovedNotice removed={removed} onUndo={undoRemove} />
                ) : null}
                <button type="button" disabled className={sheetButton(true)}>
                    Your bag is empty
                </button>
            </SheetFrame>
        );
    }

    const quote = load.kind === "ready" ? load.quote : null;
    const discount = quote?.discount ?? null;
    // The code applied and the quote that judged it agree; until then the
    // total on the button is the old one, and the button waits.
    const settled = draft.code === null || codeSettled(quote, draft.code);
    const applied =
        settled && discount?.applied === true ? discount.code : null;
    const chosen = quote?.ways.find((w) => w.type === way) ?? null;
    const addressNote = needsAddress(way) ? addressLeft(address) : null;
    const addressOk = addressNote === null;
    const pays = paysOf(quote);
    const pay = payChosen(pays, draft.pay);
    const payNote = payWords(pay);
    const canPlace =
        !!quote &&
        quote.ready &&
        quote.fulfilment === way &&
        addressOk &&
        pay !== null &&
        settled &&
        !busy;
    const total = quote ? formatAmount(quote.total, quote.currency) : "";
    const freeNote = quote ? freeDeliveryNote(quote, way) : null;
    const held = busy
        ? null
        : holdReason({
              quote,
              way,
              addressOk,
              addressNote,
              payable: pay !== null,
          });
    const pickup = way === "PICKUP" ? (quote?.pickup ?? null) : null;
    // The returns rule of what is in the bag, said again before paying.
    const returns = quote ? returnsLines(quote.lines) : [];

    function place() {
        if (!canPlace || !way) return;
        const body: Omit<StartCheckout, "key"> = {
            lines: [...items],
            fulfilment: way,
            ...(needsAddress(way) ? { address: trimmed(address) } : {}),
            ...(pay.type === "ON_HANDOVER" ? { payment: pay.type } : {}),
            ...(draft.note.trim() ? { notes: draft.note.trim() } : {}),
            // Only a code the quote applied: a refused one is never sent.
            ...(applied ? { discountCode: applied } : {}),
        };
        // The bag's print is kept for the visit beside its key, so the
        // note goes in as a number worked out from it, never its words:
        // another note is another request, and nothing typed is stored.
        const print = JSON.stringify({
            ...body,
            ...(body.notes ? { notes: notePrint(body.notes) } : {}),
        });
        const checkout =
            draft.checkout?.print === print
                ? draft.checkout
                : { print, key: checkoutKey() };
        if (checkout !== draft.checkout) {
            onDraft((d) => ({ ...d, checkout }));
        }
        onPlace(
            { ...body, key: checkout.key },
            {
                total,
                count: items.reduce((sum, item) => sum + item.quantity, 0),
            },
        );
    }

    const setField = (name: keyof DeliveryAddress) => (value: string) =>
        setAddress((a) => ({ ...a, [name]: value }));

    function applyCode() {
        const next = cleanCode(codeInput);
        if (!next) {
            setCodeError(
                codeInput.trim()
                    ? "That isn't a code this shop has. Check it and try again."
                    : "Type your code first.",
            );
            return;
        }
        setCodeError(null);
        setCodeInput(next);
        setCode(next);
    }

    function removeCode() {
        setCode(null);
        setCodeInput("");
        setCodeError(null);
    }

    // What the field says under it: the shop's refusal for the applied
    // code, or a code that couldn't be one.
    const codeNote =
        codeError ??
        (settled && discount && !discount.applied ? discount.message : null);

    // Pinned to the sheet's foot: why the button is held, what it all
    // comes to, and the button. The rest of the bag scrolls above.
    const footer = (
        <>
            {held && !problem ? (
                <p
                    id={`${site}-held`}
                    className="text-site-body mt-2 text-sm leading-normal"
                >
                    {held}
                </p>
            ) : null}
            {quote ? (
                <div className="mt-2.5 flex items-baseline gap-2.5 text-base">
                    <span className="flex-1 font-semibold">Total</span>
                    <span className="font-site-heading text-[calc(1.375rem*var(--site-heading-scale,1))] font-semibold tabular-nums tracking-[-0.01em]">
                        {total}
                    </span>
                </div>
            ) : null}
            {/* The GST inside the total, as the API summed it. One short
                line, so the button below barely moves. */}
            {quote?.gst ? (
                <p
                    data-total-gst=""
                    className="text-site-body text-right text-sm tabular-nums"
                >
                    Includes {formatAmount(quote.gst, quote.currency)} GST
                </p>
            ) : null}
            <button
                type="button"
                onClick={place}
                disabled={!canPlace}
                aria-describedby={held && !problem ? `${site}-held` : undefined}
                className={cn(sheetButton(!canPlace), "mt-2.5")}
            >
                {placeLabel({ signedIn, busy, pay: pay?.type ?? null, total })}
            </button>
        </>
    );

    return (
        <SheetFrame title="Your bag" onClose={onClose} footer={footer}>
            {load.kind === "error" ? (
                <div className="mt-3">
                    <p role="alert" className={destructiveAlertClasses}>
                        {load.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setLoad({ kind: "loading" });
                            setRound((r) => r + 1);
                        }}
                        className={cn(
                            "text-site-fg mt-2 cursor-pointer text-sm font-semibold underline",
                            focusRing,
                        )}
                    >
                        Try again
                    </button>
                </div>
            ) : null}
            {load.kind === "loading" ? (
                // The bag's own shape while its prices are asked for: the
                // sheet opens at the height it will have, not on one line
                // that then jumps.
                <div role="status" data-bag-loading="" className="mt-3">
                    <p className="text-site-body text-sm">Checking prices…</p>
                    <div aria-hidden="true" className="mt-3 grid gap-3">
                        {items.slice(0, 3).map((item) => (
                            <div
                                key={`${item.listingId}:${item.variantId ?? ""}`}
                                className="border-site-border flex gap-3 border-t pt-3"
                            >
                                <span
                                    className={cn(
                                        "size-14 shrink-0 rounded-[calc(var(--site-radius)+4px)]",
                                        quietFill,
                                    )}
                                />
                                <span className="grid flex-1 content-start gap-2 pt-1">
                                    <span
                                        className={cn(
                                            "h-3.5 w-3/5 rounded",
                                            quietFill,
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "h-3 w-1/4 rounded",
                                            quietFill,
                                        )}
                                    />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {quote ? (
                <div className="mt-3">
                    <BagLines
                        site={site}
                        quote={quote}
                        caps={caps}
                        onRemoved={setRemoved}
                    />
                    {removed ? (
                        <RemovedNotice removed={removed} onUndo={undoRemove} />
                    ) : null}
                    <div className="border-site-border mt-3 flex gap-2.5 border-t py-2.5 text-sm">
                        <span className="flex-1">Subtotal</span>
                        <span className="font-semibold tabular-nums">
                            {formatAmount(quote.subtotal, quote.currency)}
                        </span>
                    </div>
                    <div className="border-site-border flex gap-2.5 border-t py-2.5 text-sm">
                        <span className="flex-1">
                            {chosen?.label ?? "Pick-up or delivery"}
                        </span>
                        <span className="font-semibold tabular-nums">
                            {chosen
                                ? chosen.fee
                                    ? formatAmount(chosen.fee, quote.currency)
                                    : "Free"
                                : "—"}
                        </span>
                    </div>
                    {freeNote ? (
                        <p className="text-site-body -mt-1 pb-2 text-sm">
                            {freeNote}
                        </p>
                    ) : null}
                    {applied && discount?.applied ? (
                        <div className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-sm">
                            <span className="min-w-0 flex-1">
                                Code {discount.code}
                            </span>
                            <button
                                type="button"
                                onClick={removeCode}
                                aria-label={`Remove code ${discount.code}`}
                                className={cn(
                                    "text-site-fg coarse:min-h-11 cursor-pointer text-sm underline underline-offset-2",
                                    focusRing,
                                )}
                            >
                                Remove
                            </button>
                            <span className="font-semibold tabular-nums">
                                −{formatAmount(discount.amount, quote.currency)}
                            </span>
                        </div>
                    ) : null}
                    <CodeField
                        site={site}
                        open={codeOpen}
                        onOpen={() => setCodeOpen(true)}
                        value={codeInput}
                        onChange={(v) => {
                            setCodeInput(v);
                            setCodeError(null);
                        }}
                        onApply={applyCode}
                        checking={!settled}
                        applied={applied}
                        note={codeNote}
                    />

                    {quote.ways.length > 0 ? (
                        <>
                            <p
                                id={`${site}-how`}
                                className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]"
                            >
                                How
                            </p>
                            <div
                                role="radiogroup"
                                aria-labelledby={`${site}-how`}
                                className="grid gap-1.5"
                            >
                                {quote.ways.map((w) => (
                                    <button
                                        key={w.type}
                                        type="button"
                                        role="radio"
                                        aria-checked={way === w.type}
                                        onClick={() => setWay(w.type)}
                                        className={optionClasses(
                                            way === w.type,
                                        )}
                                    >
                                        <span className="grid gap-0.5 text-left">
                                            <span className="text-[14.5px] font-semibold">
                                                {w.label}
                                            </span>
                                            <span className="text-site-body text-sm">
                                                {w.fee
                                                    ? formatAmount(
                                                          w.fee,
                                                          quote.currency,
                                                      )
                                                    : "Free"}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-site-body mt-3 text-sm">
                            These can't be ordered together. Take one out to see
                            how the rest can reach you.
                        </p>
                    )}

                    {pays.length > 1 ? (
                        <>
                            <p
                                id={`${site}-pay`}
                                className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]"
                            >
                                Pay
                            </p>
                            <div
                                role="radiogroup"
                                aria-labelledby={`${site}-pay`}
                                className="grid gap-1.5"
                            >
                                {pays.map((p) => (
                                    <button
                                        key={p.type}
                                        type="button"
                                        role="radio"
                                        aria-checked={pay?.type === p.type}
                                        onClick={() => setPay(p.type)}
                                        className={optionClasses(
                                            pay?.type === p.type,
                                        )}
                                    >
                                        <span className="text-[14.5px] font-semibold">
                                            {p.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {pickup ? (
                        <p className="text-site-body mt-2.5 text-sm leading-normal">
                            <span className="text-site-fg font-semibold">
                                Pick-up from
                            </span>{" "}
                            {pickup.address}
                            {pickup.hours ? (
                                <span className="block">{pickup.hours}</span>
                            ) : null}
                        </p>
                    ) : null}

                    {needsAddress(way) ? (
                        <fieldset className="mt-3.5">
                            <legend className="text-site-muted mb-1 text-xs font-bold uppercase tracking-[0.08em]">
                                Deliver to
                            </legend>
                            {asksSaved ? (
                                <p
                                    role="status"
                                    className="text-site-body text-sm"
                                >
                                    Looking for your last address…
                                </p>
                            ) : draft.saved === "shown" ? (
                                <SavedAddress
                                    address={address}
                                    onDifferent={() =>
                                        onDraft((d) => ({
                                            ...d,
                                            address: EMPTY_ADDRESS,
                                            saved: "typing",
                                        }))
                                    }
                                />
                            ) : (
                                <AddressFields
                                    site={site}
                                    address={address}
                                    onChange={setField}
                                />
                            )}
                        </fieldset>
                    ) : null}
                </div>
            ) : null}

            {quote ? (
                <label className="mt-3.5 block text-[13.5px] font-medium">
                    Note for {businessName}{" "}
                    <span className="text-site-body font-normal">
                        (optional)
                    </span>
                    <textarea
                        rows={2}
                        maxLength={MAX_ORDER_NOTE}
                        value={draft.note}
                        onChange={(e) =>
                            onDraft((d) => ({ ...d, note: e.target.value }))
                        }
                        placeholder="A gift message, or anything they should know"
                        className={cn(
                            "border-site-border text-site-fg placeholder:text-site-muted mt-1 block w-full resize-y rounded-[calc(var(--site-radius)+8px)] border px-3 py-2.5 text-base",
                            inputFill,
                            focusRing,
                        )}
                    />
                </label>
            ) : null}

            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem.message}
                </p>
            ) : null}

            {notice ? (
                <p
                    role="status"
                    className="text-site-fg mt-3 text-[13.5px] font-semibold"
                >
                    {notice}
                </p>
            ) : null}
            {payNote ? (
                <p className="text-site-body mt-2.5 text-sm leading-normal">
                    {payNote}
                </p>
            ) : null}
            {returns.map((rule) => (
                <p
                    key={rule}
                    className="text-site-body mt-1.5 text-sm leading-normal [overflow-wrap:anywhere]"
                >
                    {rule}
                </p>
            ))}
        </SheetFrame>
    );
}

/**
 * What the bag's button reads, by what pressing it does. Signed out, the
 * email code is the last step and nothing else is asked after it: an order
 * paid at the handover is placed there and then, so the button says "Sign
 * in and place order", and one paid online goes on to the payment window,
 * "Sign in and pay". Never a bare "Continue".
 */
export function placeLabel(input: {
    signedIn: boolean;
    busy: boolean;
    /** How it will be paid; null until the quote says. */
    pay: ShopPayment | null;
    /** "₹560", or "" while the bag is being priced. */
    total: string;
}): string {
    if (input.busy) return "Starting…";
    const does = input.signedIn
        ? "Place order"
        : input.pay === "ONLINE"
          ? "Sign in and pay"
          : input.pay === "ON_HANDOVER"
            ? "Sign in and place order"
            : "Sign in to order";
    return input.total ? `${does} · ${input.total}` : does;
}

/** How the quote's chosen way can be paid; online for an older API. */
function paysOf(
    quote: CheckoutQuote | null,
): { type: ShopPayment; label: string }[] {
    if (!quote) return [];
    return quote.payments ?? [{ type: "ONLINE", label: "Pay online" }];
}

/** The way to pay picked, if still offered; else the first offered. */
export function payChosen(
    pays: readonly { type: ShopPayment; label: string }[],
    picked: ShopPayment | null,
): { type: ShopPayment; label: string } | null {
    return pays.find((p) => p.type === picked) ?? pays.at(0) ?? null;
}

/**
 * What the customer is told about paying, above the button. Nothing until
 * the quote is back: how to pay comes with it, and a shop that only takes
 * money at the handover must not first claim "You pay online" (#837).
 */
export function payWords(
    pay: { type: ShopPayment; label: string } | null,
): string | null {
    if (!pay) return null;
    if (pay.type === "ON_HANDOVER") {
        return pay.label === "Pay on delivery"
            ? "You'll pay when your order is delivered. Your order is placed now."
            : "You'll pay at pick-up. Your order is placed now.";
    }
    return "You pay online in a secure window. Your order is placed once the payment goes through.";
}
