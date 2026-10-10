"use client";

import { useEffect, useState } from "react";

import { focusRing } from "../booking-flow/styles";
import { formatAmount } from "../lib/money";
import { cn } from "../lib/utils";
import { useProductSelection } from "../product/product-page";
import { addToBag, openBag, useBag } from "./bag-store";

/** How long "added to your bag" stays before it goes by itself. */
export const ADDED_SHOWN_MS = 4_000;

/**
 * Whether one more can go in the bag (UX-058): not past what the page says
 * is left ("Only 1 left"). Null `left` is a shelf the page doesn't count
 * out loud — the bag's quote still refuses what can't be sold.
 */
export function roomInBag(left: number | null | undefined, inBag: number) {
    return left === null || left === undefined || inBag < left;
}

/** The button's words once everything left is in the bag. */
export function allInBagWords(left: number): string {
    return left === 1
        ? "The last one is in your bag"
        : `All ${left} are in your bag`;
}

/**
 * The product page's action where the site takes online orders (round-2
 * G13): Add to bag, for the option the visitor picked. Off, reading "Sold
 * out", when none of it can be sold now. After adding, it says so and
 * offers the bag, the way the design's toast does, without leaving the
 * page; a bag already holding its most lines says it is full instead.
 *
 * It sits in `ProductPage`'s action slot and reads the choice with
 * `useProductSelection`, so the server page passes it as a plain node.
 *
 * The button says what it adds for: "Add to bag · ₹180". Under 700px the
 * whole block is a bar pinned to the foot of the screen, as the booking
 * page's is, so the price and the button are in reach wherever the page is
 * scrolled to. It is the same button and the same message, moved by CSS
 * alone: nothing waits for a script to know the screen's width. The page
 * keeps room for the bar under its footer ({@link BAR_ROOM}).
 */

/**
 * Room under the page for the pinned bar, on a phone only: the bar is
 * fixed, so without it the last lines of the site's footer sit behind it.
 */
const BAR_ROOM =
    "@media (max-width:699px){body{padding-bottom:calc(84px + env(safe-area-inset-bottom))}}";

/** The block in the page above 700px; a pinned bar under it. */
const bar =
    "max-[699px]:bg-site-surface max-[699px]:border-site-border max-[699px]:fixed max-[699px]:inset-x-0 max-[699px]:bottom-[var(--site-consent-offset,0px)] max-[699px]:z-40 max-[699px]:flex max-[699px]:flex-col-reverse max-[699px]:gap-2 max-[699px]:border-t max-[699px]:px-4 max-[699px]:pb-[calc(12px+env(safe-area-inset-bottom))] max-[699px]:pt-3 max-[699px]:shadow-[0_-8px_24px_hsl(var(--site-fg)/0.12)]";

export const actionButton = cn(
    "bg-site-accent text-site-accent-fg inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-[var(--site-radius,2px)] px-5 text-sm font-semibold transition-[opacity,transform] duration-100 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:w-auto",
    focusRing,
);

export function AddToBag({
    site,
    listingId,
}: {
    /** The site the bag belongs to (its id). */
    site: string;
    /** The product's listing at the site's storefront. */
    listingId: string;
}) {
    const selection = useProductSelection();
    const [added, setAdded] = useState<string | null>(null);
    const [full, setFull] = useState(false);
    // "‹Product› added to your bag." goes by itself: it has said what
    // happened, and on a phone it sits over the page. Each add says it
    // afresh (`said` counts them). The button still reads "Add another".
    const [said, setSaid] = useState(0);
    const [showAdded, setShowAdded] = useState(false);
    useEffect(() => {
        if (said === 0) return;
        const timer = setTimeout(() => setShowAdded(false), ADDED_SHOWN_MS);
        return () => clearTimeout(timer);
    }, [said]);
    const bag = useBag(site);
    if (!selection) return null;
    const inBag =
        bag.find(
            (i) =>
                i.listingId === listingId &&
                i.variantId === selection.variantId,
        )?.quantity ?? 0;
    const room = roomInBag(selection.left, inBag);

    const what = selection.variantTitle
        ? `${selection.name} (${selection.variantTitle})`
        : selection.name;

    function add() {
        if (!selection || selection.soldOut || !room) return;
        const bag = addToBag(site, {
            listingId,
            variantId: selection.variantId,
            quantity: 1,
        });
        // A full bag keeps what it had: say so, never "added".
        const inBag = bag.some(
            (i) =>
                i.listingId === listingId &&
                i.variantId === selection.variantId,
        );
        setFull(!inBag);
        setAdded(inBag ? what : null);
        setShowAdded(inBag);
        if (inBag) setSaid((n) => n + 1);
    }

    // What one more costs, on the button itself.
    const price = selection.currency
        ? formatAmount(selection.price, selection.currency)
        : "";
    const forPrice = price ? ` · ${price}` : "";

    return (
        <div data-bag-bar="" className={bar}>
            <style>{BAR_ROOM}</style>
            <button
                type="button"
                onClick={add}
                disabled={selection.soldOut || !room}
                className={cn(actionButton, "max-[699px]:min-h-12")}
            >
                {selection.soldOut
                    ? "Sold out"
                    : !room && typeof selection.left === "number"
                      ? allInBagWords(selection.left)
                      : added === what
                        ? `Add another${forPrice}`
                        : `Add to bag${forPrice}`}
            </button>
            {full ? (
                <p
                    role="status"
                    className="text-site-body mt-2 flex flex-wrap items-center gap-x-2 text-sm max-[699px]:mt-0"
                >
                    <span>
                        Your bag is full. Take something out to add this.
                    </span>
                    <button
                        type="button"
                        onClick={openBag}
                        className={cn(
                            "text-site-fg cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:no-underline",
                            focusRing,
                        )}
                    >
                        View bag
                    </button>
                </p>
            ) : null}
            {added && showAdded ? (
                <p
                    role="status"
                    className="text-site-body mt-2 flex flex-wrap items-center gap-x-2 text-sm max-[699px]:mt-0"
                >
                    <span>{added} added to your bag.</span>
                    <button
                        type="button"
                        onClick={openBag}
                        className={cn(
                            "text-site-fg cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:no-underline",
                            focusRing,
                        )}
                    >
                        View bag
                    </button>
                </p>
            ) : null}
        </div>
    );
}
