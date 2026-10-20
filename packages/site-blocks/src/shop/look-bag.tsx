"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { useEffect, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { formatAmount } from "../lib/money";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import type { CheckoutQuote, QuoteLine, ShopCheckoutApi } from "./api";
import { SHOP_OFFLINE } from "./api";
import type { RemovedLine } from "./bag-lines";
import {
    lineGstWords,
    lineKey,
    lineName,
    lineNote,
    RemovedNotice,
    returnsLines,
} from "./bag-lines";
import type { BagDraft } from "./bag-sheet";
import { overStock, stockNotice } from "./bag-sheet";
import { BagStepper } from "./bag-stepper";
import type { BagItem } from "./bag-store";
import { addToBag, MAX_ITEM_QUANTITY, setQuantity } from "./bag-store";
import { cleanCode, CodeField, codeSettled } from "./code-field";
import { shopLink, shopPrimary } from "./look-shop";
import { SheetFrame } from "./sheet-frame";

/**
 * The bag under a look (DEC-172, plan U11, #1102): the boards VA15, VD15
 * and VB15. A dialog: a drawer from the right on a desk, a sheet from the
 * foot on a phone. Classic keeps `BagSheet`.
 *
 * It holds what is in the bag and nothing about how it reaches the
 * customer: **pick-up or delivery is asked once, in checkout** (owner, 20
 * Oct). So the bag is its lines (each with the − 1 + stepper, Remove and
 * Undo), a discount code, "Total so far" with the GST in it, one line
 * saying what pick-up and delivery cost and that they choose at checkout,
 * and **Check out**, the view's one filled button, to `/checkout`.
 *
 * Every amount is the server's quote, asked again whenever the bag or the
 * code changes. A line that sold out since it was added says so, and Check
 * out waits until it is taken out: nothing is swapped silently. Asking for
 * more than is left sets the line to what is, and says so (UX-058).
 */

type Load =
    | { kind: "loading" }
    | { kind: "ready"; quote: CheckoutQuote }
    | { kind: "error"; message: string };

/**
 * "Pick-up free, or delivery ₹40 (free over ₹800). You choose at
 * checkout." From the quote's ways only; null when it offers none.
 */
export function waysLine(quote: CheckoutQuote): string | null {
    if (quote.ways.length === 0) return null;
    const free = quote.freeDelivery?.over
        ? formatAmount(quote.freeDelivery.over, quote.currency)
        : null;
    const parts = quote.ways.map((w) => {
        const label =
            w.type === "PICKUP" ? "pick-up" : w.label.trim().toLowerCase();
        if (!w.fee) return `${label} free`;
        const fee = formatAmount(w.fee, quote.currency);
        return w.type !== "PICKUP" && free
            ? `${label} ${fee} (free over ${free})`
            : `${label} ${fee}`;
    });
    const said =
        parts.length === 1
            ? parts[0]
            : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
    const sentence = said.charAt(0).toUpperCase() + said.slice(1);
    return quote.ways.length > 1
        ? `${sentence}. You choose at checkout.`
        : `${sentence}.`;
}

/** Why Check out waits, in a sentence beside it; null when it can go. */
export function bagHold(quote: CheckoutQuote | null): string | null {
    if (!quote) return null;
    if (quote.lines.some((l) => l.state === "gone")) {
        return "Take out what's no longer sold to check out.";
    }
    if (quote.lines.some((l) => l.state === "sold-out")) {
        return "Take out what's sold out to check out.";
    }
    if (quote.lines.some((l) => l.state === "short")) {
        return "Fewer are left than you asked for. Lower the amount to check out.";
    }
    if (quote.ways.length === 0) {
        return "These can't be ordered together. Take one out to check out.";
    }
    return null;
}

export function LookBagSheet({
    look,
    site,
    items,
    api,
    draft,
    onDraft,
    checkoutHref,
    onClose,
}: {
    look: LookId;
    site: string;
    items: readonly BagItem[];
    api: ShopCheckoutApi;
    draft: BagDraft;
    onDraft: (change: (draft: BagDraft) => BagDraft) => void;
    /** Where Check out leads: the checkout page. */
    checkoutHref: string;
    onClose: () => void;
}) {
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [round, setRound] = useState(0);
    const [caps, setCaps] = useState<Readonly<Record<string, number>>>({});
    const [notice, setNotice] = useState<string | null>(null);
    const [removed, setRemoved] = useState<RemovedLine | null>(null);
    const [codeOpen, setCodeOpen] = useState(draft.code !== null);
    const [codeInput, setCodeInput] = useState(draft.code ?? "");
    const [codeError, setCodeError] = useState<string | null>(null);
    const setCode = (next: string | null) =>
        onDraft((d) => ({ ...d, code: next }));

    const bagPrint = JSON.stringify(items);
    useEffect(() => {
        if (items.length === 0) return;
        let live = true;
        const timer = setTimeout(() => {
            void api
                .quote({
                    lines: [...items],
                    ...(draft.code ? { discountCode: draft.code } : {}),
                })
                .catch(() => null)
                .then((result) => {
                    if (!live) return;
                    if (result?.ok) {
                        setLoad({ kind: "ready", quote: result.data });
                        const over = overStock(result.data.lines);
                        if (over.length > 0) {
                            setCaps((c) => {
                                const next = { ...c };
                                for (const { line, left } of over) {
                                    next[lineKey(line)] = left;
                                }
                                return next;
                            });
                            setNotice(stockNotice(over));
                            for (const { line, left } of over) {
                                setQuantity(
                                    site,
                                    {
                                        listingId: line.listingId,
                                        variantId: line.variantId,
                                    },
                                    left,
                                );
                            }
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the bag's contents, by value
    }, [bagPrint, api, round, draft.code]);

    const count = items.reduce((n, i) => n + i.quantity, 0);
    const title =
        items.length === 0
            ? "Your bag"
            : `Your bag · ${count} ${count === 1 ? "item" : "items"}`;

    function undoRemove() {
        if (!removed) return;
        addToBag(site, {
            listingId: removed.listingId,
            variantId: removed.variantId,
            quantity: removed.quantity,
        });
        setRemoved(null);
    }

    if (items.length === 0) {
        return (
            <SheetFrame look={look} title={title} onClose={onClose}>
                <p className="text-site-body mt-3 text-[15px]">
                    Your bag is empty. Add something from the shop.
                </p>
                {removed ? (
                    <RemovedNotice removed={removed} onUndo={undoRemove} />
                ) : null}
            </SheetFrame>
        );
    }

    const quote = load.kind === "ready" ? load.quote : null;
    const settled = draft.code === null || codeSettled(quote, draft.code);
    const discount = quote?.discount ?? null;
    const applied =
        settled && discount?.applied === true ? discount.code : null;
    const held = bagHold(quote);
    const ready = !!quote && held === null && settled;
    const total = quote ? formatAmount(quote.total, quote.currency) : "";
    const codeNote =
        codeError ??
        (settled && discount && !discount.applied ? discount.message : null);

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

    const footer = (
        <div className="pt-3">
            {quote ? (
                <>
                    <div className="flex items-baseline gap-3">
                        <span className="flex-1 text-[16px] font-semibold">
                            Total so far
                        </span>
                        <span
                            data-bag-total=""
                            className="font-site-heading text-[calc(1.5rem*var(--site-heading-scale,1))] tabular-nums"
                        >
                            {total}
                        </span>
                    </div>
                    <p className="text-site-body mt-1 text-[13.5px] leading-normal">
                        {quote.gst
                            ? `Includes ${formatAmount(quote.gst, quote.currency)} GST. `
                            : null}
                        {waysLine(quote) ?? null}
                    </p>
                </>
            ) : null}
            {held ? (
                <p
                    id={`${site}-bag-held`}
                    className="text-site-fg mt-2 text-[14px] font-semibold"
                >
                    {held}
                </p>
            ) : null}
            {ready ? (
                <Link
                    href={checkoutHref}
                    onClick={onClose}
                    data-bag-checkout=""
                    className={cn(
                        shopPrimary(),
                        "mt-3 flex w-full justify-between",
                    )}
                >
                    <span>Check out</span>
                    <span>{total}</span>
                </Link>
            ) : (
                <button
                    type="button"
                    disabled
                    aria-describedby={held ? `${site}-bag-held` : undefined}
                    className={cn(
                        shopPrimary(true),
                        "mt-3 w-full justify-between",
                    )}
                >
                    <span>Check out</span>
                    {total ? <span>{total}</span> : null}
                </button>
            )}
        </div>
    );

    return (
        <SheetFrame look={look} title={title} onClose={onClose} footer={footer}>
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
                        className={cn(shopLink, "mt-1")}
                    >
                        Try again
                    </button>
                </div>
            ) : null}
            {load.kind === "loading" ? (
                <p
                    role="status"
                    data-bag-checking=""
                    className="text-site-body mt-3 text-sm"
                >
                    Checking prices…
                </p>
            ) : null}
            {quote ? (
                <ul className="m-0 mt-2 list-none p-0">
                    {quote.lines.map((line) => (
                        <LookBagLine
                            key={lineKey(line)}
                            site={site}
                            line={line}
                            currency={quote.currency}
                            cap={caps[lineKey(line)]}
                            anyPhoto={quote.lines.some((l) => l.image)}
                            onRemoved={setRemoved}
                        />
                    ))}
                </ul>
            ) : null}
            {removed ? (
                <RemovedNotice removed={removed} onUndo={undoRemove} />
            ) : null}
            {notice ? (
                <p
                    role="status"
                    className="text-site-fg mt-3 text-[14px] font-semibold"
                >
                    {notice}
                </p>
            ) : null}
            {quote && applied && discount?.applied ? (
                <div className="border-site-border flex items-center gap-3 border-t py-2.5 text-[14.5px]">
                    <span className="min-w-0 flex-1">Code {discount.code}</span>
                    <button
                        type="button"
                        onClick={() => {
                            setCode(null);
                            setCodeInput("");
                            setCodeError(null);
                        }}
                        aria-label={`Remove code ${discount.code}`}
                        className={shopLink}
                    >
                        Remove
                    </button>
                    <span className="font-semibold tabular-nums">
                        −{formatAmount(discount.amount, quote.currency)}
                    </span>
                </div>
            ) : null}
            {quote ? (
                <div className="[&_button]:min-h-11 [&_input]:h-11">
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
                </div>
            ) : null}
            {quote
                ? returnsLines(quote.lines).map((rule) => (
                      <p
                          key={rule}
                          className="text-site-body mt-2 text-[13.5px] leading-normal [overflow-wrap:anywhere]"
                      >
                          {rule}
                      </p>
                  ))
                : null}
        </SheetFrame>
    );
}

/** One line, set like a receipt: a dotted rule under each. */
function LookBagLine({
    site,
    line,
    currency,
    cap,
    anyPhoto,
    onRemoved,
}: {
    site: string;
    line: QuoteLine;
    currency: string;
    cap: number | undefined;
    anyPhoto: boolean;
    onRemoved: (line: RemovedLine) => void;
}) {
    const name = lineName(line);
    const note = lineNote(line);
    const gst = lineGstWords(line, currency);
    const at = { listingId: line.listingId, variantId: line.variantId };
    return (
        <li
            data-bag-line=""
            className="border-site-border flex gap-3.5 border-b border-dotted py-4"
        >
            {line.image ? (
                <img
                    src={line.image.url}
                    alt=""
                    width={64}
                    height={64}
                    {...siteImage("below", {
                        src: line.image.url,
                        sizes: "64px",
                    })}
                    className="rounded-site-s size-16 shrink-0 object-cover"
                />
            ) : anyPhoto ? (
                <span
                    aria-hidden="true"
                    className="rounded-site-s size-16 shrink-0 bg-[color-mix(in_srgb,hsl(var(--site-accent))_10%,hsl(var(--site-surface)))]"
                />
            ) : null}
            <div className="min-w-0 flex-1">
                <div className="flex gap-3">
                    <span className="font-site-heading min-w-0 flex-1 text-[17px] leading-snug [overflow-wrap:anywhere]">
                        {line.name}
                    </span>
                    <span className="font-semibold tabular-nums">
                        {formatAmount(line.amount, currency)}
                    </span>
                </div>
                <span className="text-site-body block text-[13.5px]">
                    {line.variantTitle ??
                        (line.state === "gone"
                            ? null
                            : `${formatAmount(line.unitPrice, currency)} each`)}
                </span>
                {gst ? (
                    <span
                        data-line-gst=""
                        className="text-site-body block text-[13px] tabular-nums"
                    >
                        {gst}
                    </span>
                ) : null}
                {note ? (
                    <span className="text-site-fg block text-[14px] font-semibold">
                        {note}
                    </span>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {line.state === "gone" ? null : (
                        <BagStepper
                            name={name}
                            quantity={line.quantity}
                            min={1}
                            canAdd={
                                line.state === "ok" &&
                                line.quantity < MAX_ITEM_QUANTITY &&
                                line.quantity < (cap ?? Infinity)
                            }
                            onChange={(q) => setQuantity(site, at, q)}
                        />
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setQuantity(site, at, 0);
                            onRemoved({ ...at, quantity: line.quantity, name });
                        }}
                        aria-label={`Remove ${name}`}
                        className={shopLink}
                    >
                        Remove
                    </button>
                </div>
            </div>
        </li>
    );
}
