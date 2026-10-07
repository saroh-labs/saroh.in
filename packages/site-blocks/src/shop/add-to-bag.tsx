"use client";

import { useState } from "react";

import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { useProductSelection } from "../product/product-page";
import { addToBag, openBag, useBag } from "./bag-store";

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
 */

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
    }

    return (
        <div>
            <button
                type="button"
                onClick={add}
                disabled={selection.soldOut || !room}
                className={actionButton}
            >
                {selection.soldOut
                    ? "Sold out"
                    : !room && typeof selection.left === "number"
                      ? allInBagWords(selection.left)
                      : added === what
                        ? "Add another"
                        : "Add to bag"}
            </button>
            {full ? (
                <p
                    role="status"
                    className="text-site-body mt-2 flex flex-wrap items-center gap-x-2 text-sm"
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
            {added ? (
                <p
                    role="status"
                    className="text-site-body mt-2 flex flex-wrap items-center gap-x-2 text-sm"
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
