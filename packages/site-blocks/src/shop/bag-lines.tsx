"use client";

import { focusRing, quietFill } from "../booking-flow/styles";
import { gstLineWords, gstOnPriceOf } from "../lib/gst-price";
import { formatAmount } from "../lib/money";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import type { CheckoutQuote, QuoteLine } from "./api";
import { MAX_ITEM_QUANTITY, setQuantity } from "./bag-store";

/**
 * The bag's lines: each with its photo, what one costs, − and + and its
 * amount, and "Remove". − stops at one: a line leaves the bag only when the
 * customer says so, and the bag then offers to put it back.
 *
 * A bag with no photos at all draws no photo column: lines of empty squares
 * said only that nothing was there. Where some lines have a photo, the
 * others keep a quiet square, so the names line up.
 */

/** A bag line's key: its listing and variant. */
export const lineKey = (l: Pick<QuoteLine, "listingId" | "variantId">) =>
    `${l.listingId}:${l.variantId ?? ""}`;

/** "Sourdough · Large", or the product's name alone. */
export const lineName = (l: Pick<QuoteLine, "name" | "variantTitle">) =>
    l.variantTitle ? `${l.name} · ${l.variantTitle}` : l.name;

/** What a line says under its name when it can't be sold as asked. */
export function lineNote(line: QuoteLine): string | null {
    if (line.state === "gone") return "No longer sold here. Take it out.";
    if (line.state === "sold-out") return "Sold out";
    if (line.state === "short") {
        return `Only ${line.available ?? 0} left`;
    }
    return null;
}

/**
 * The GST in or on one of a line, under its price: "includes ₹152.54 GST
 * (18%)", or "₹1,000 + ₹180 GST (18%)" where it was added. Null when the
 * API said none, and for a line no longer sold.
 */
export function lineGstWords(line: QuoteLine, currency: string): string | null {
    const gst = gstOnPriceOf(line.gst);
    return gst && line.state !== "gone" ? gstLineWords(gst, currency) : null;
}

/** A line taken out of the bag, kept so it can be put back. */
export interface RemovedLine {
    listingId: string;
    variantId: string | null;
    quantity: number;
    name: string;
}

// 30px under a mouse, 44px under a finger.
const stepper = cn(
    "border-site-border bg-site-bg text-site-fg coarse:size-11 size-[30px] cursor-pointer rounded-lg border text-base leading-none hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
    focusRing,
);

export function BagLines({
    site,
    quote,
    caps,
    onRemoved,
}: {
    site: string;
    quote: CheckoutQuote;
    /** What each line was capped at once the quote said fewer are left. */
    caps: Readonly<Record<string, number>>;
    /** A line was taken out: the bag offers to put it back. */
    onRemoved: (line: RemovedLine) => void;
}) {
    const anyPhoto = quote.lines.some((line) => line.image);
    return (
        <ul className="m-0 list-none p-0">
            {quote.lines.map((line) => {
                const note = lineNote(line);
                const gst = lineGstWords(line, quote.currency);
                const name = lineName(line);
                const at = {
                    listingId: line.listingId,
                    variantId: line.variantId,
                };
                const change = (q: number) => setQuantity(site, at, q);
                return (
                    <li
                        key={lineKey(line)}
                        className="border-site-border flex gap-3 border-t py-3 text-sm"
                    >
                        {line.image ? (
                            <img
                                src={line.image.url}
                                alt=""
                                width={56}
                                height={56}
                                {...siteImage()}
                                className="border-site-border size-14 shrink-0 rounded-[calc(var(--site-radius)+4px)] border object-cover"
                            />
                        ) : anyPhoto ? (
                            <span
                                aria-hidden="true"
                                data-line-blank=""
                                className={cn(
                                    "size-14 shrink-0 rounded-[calc(var(--site-radius)+4px)]",
                                    quietFill,
                                )}
                            />
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <div className="flex gap-2.5">
                                <span className="min-w-0 flex-1 font-semibold leading-snug [overflow-wrap:anywhere]">
                                    {name}
                                </span>
                                <span className="font-semibold tabular-nums">
                                    {formatAmount(line.amount, quote.currency)}
                                </span>
                            </div>
                            {line.state === "gone" ? null : (
                                <span className="text-site-body block tabular-nums">
                                    {formatAmount(
                                        line.unitPrice,
                                        quote.currency,
                                    )}{" "}
                                    each
                                </span>
                            )}
                            {gst ? (
                                <span
                                    data-line-gst=""
                                    className="text-site-body block tabular-nums"
                                >
                                    {gst}
                                </span>
                            ) : null}
                            {note ? (
                                <span className="text-site-fg block font-semibold">
                                    {note}
                                </span>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            change(line.quantity - 1)
                                        }
                                        // The last one leaves by Remove,
                                        // never by a slip of the thumb.
                                        disabled={line.quantity <= 1}
                                        aria-label={`One fewer ${name}`}
                                        className={stepper}
                                    >
                                        −
                                    </button>
                                    {/* Words a screen reader reads: an
                                        aria-label on a plain span is not
                                        (UX-082). */}
                                    <span className="min-w-5 text-center font-semibold tabular-nums">
                                        <span aria-hidden>{line.quantity}</span>
                                        <span className="sr-only">
                                            {`${line.quantity} of ${name}`}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            change(line.quantity + 1)
                                        }
                                        disabled={
                                            line.state !== "ok" ||
                                            line.quantity >=
                                                MAX_ITEM_QUANTITY ||
                                            line.quantity >=
                                                (caps[lineKey(line)] ??
                                                    Infinity)
                                        }
                                        aria-label={`One more ${name}`}
                                        className={stepper}
                                    >
                                        +
                                    </button>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        change(0);
                                        onRemoved({
                                            ...at,
                                            quantity: line.quantity,
                                            name,
                                        });
                                    }}
                                    aria-label={`Remove ${name}`}
                                    className={cn(
                                        "text-site-fg coarse:min-h-11 cursor-pointer text-sm underline underline-offset-2",
                                        focusRing,
                                    )}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/** "Sourdough removed." with Undo, until something else happens. */
export function RemovedNotice({
    removed,
    onUndo,
}: {
    removed: RemovedLine;
    onUndo: () => void;
}) {
    return (
        <p
            role="status"
            className="text-site-body mt-3 flex flex-wrap items-center gap-x-2 text-sm"
        >
            <span className="[overflow-wrap:anywhere]">
                {removed.name} removed.
            </span>
            <button
                type="button"
                onClick={onUndo}
                className={cn(
                    "text-site-fg coarse:min-h-11 cursor-pointer font-semibold underline underline-offset-2",
                    focusRing,
                )}
            >
                Undo
            </button>
        </p>
    );
}

/**
 * The returns rules of what is in the bag, for the line above its button:
 * each rule once, in the bag's order, with the products it covers named
 * when the bag holds more than one rule (or some lines have none).
 */
export function returnsLines(lines: readonly QuoteLine[]): string[] {
    const sold = lines.filter((l) => l.state !== "gone");
    const rules = new Map<string, string[]>();
    for (const line of sold) {
        const rule = line.returns?.trim();
        if (!rule) continue;
        rules.set(rule, [...(rules.get(rule) ?? []), line.name]);
    }
    if (rules.size === 0) return [];
    const forAll =
        rules.size === 1 && sold.every((l) => (l.returns?.trim() ?? "") !== "");
    // `Array.from`, not a spread: an app that renders this compiles it for
    // a target where a Map or a Set can't be spread.
    return Array.from(rules.entries()).map(([rule, names]) =>
        forAll
            ? `Returns: ${rule}`
            : `Returns for ${names.filter((n, i) => names.indexOf(n) === i).join(", ")}: ${rule}`,
    );
}
