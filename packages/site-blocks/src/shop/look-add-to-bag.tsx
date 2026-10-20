"use client";

import type { LookId } from "@saroh/block-contract";
import { useEffect, useRef, useState } from "react";

import { browsePriceWords } from "../lib/gst-price";
import { formatAmount } from "../lib/money";
import { cn } from "../lib/utils";
import { useProductSelection } from "../product/product-page";
import { ADDED_SHOWN_MS, allInBagWords, roomInBag } from "./add-to-bag";
import { BagStepper } from "./bag-stepper";
import {
    addToBag,
    bagCount,
    onBagShown,
    openBag,
    setQuantity,
    useBag,
} from "./bag-store";
import { SHOP_LABEL, shopLink, shopOutline, shopPrimary } from "./look-shop";

/**
 * A product page's action under a look (DEC-172, plan U11, #1102): the
 * boards VA13/14, VD13/14 and VB13/14. Classic keeps `AddToBag`.
 *
 * - Before: "Add to bag · ₹280", the page's one filled button
 *   (`data-site-primary`). It adds one.
 * - Once that option is in the bag the button becomes the − 1 + stepper
 *   showing how many are in the bag ("1 in your bag"): the stepper has one
 *   meaning, the bag's. − to 0 brings Add to bag back.
 * - Adding says so in a small note under the header ("Added to your bag"),
 *   announced, for 4 s or until the next tap, with Keep shopping and View
 *   bag. It fades and rises over the look's slow step (200 ms) and never
 *   covers the page's button.
 * - On a phone the bar at the foot repeats the action only while the
 *   page's own button is off screen, and hides whenever a sheet is open
 *   (the bag): one fixed bar at a time.
 * - Sold out: "Sold out", "Ask about it" where the site has a way to ask,
 *   and the way back to the shop. No bar, no date, no notify list.
 */
export function LookAddToBag({
    look,
    site,
    listingId,
    askHref = null,
    shopHref = "/shop",
}: {
    look: LookId;
    site: string;
    listingId: string;
    /** Where "Ask about it" leads; null: none. */
    askHref?: string | null;
    shopHref?: string;
}) {
    const selection = useProductSelection();
    const bag = useBag(site);
    const main = useRef<HTMLDivElement>(null);
    const [mainShown, setMainShown] = useState(true);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [said, setSaid] = useState(0);
    const [slip, setSlip] = useState<string | null>(null);
    const [full, setFull] = useState(false);

    // The bar shows only while the page's own action is off screen.
    useEffect(() => {
        const el = main.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const seen = new IntersectionObserver(([entry]) =>
            setMainShown(entry.isIntersecting),
        );
        seen.observe(el);
        return () => seen.disconnect();
    }, []);
    // …and never over an open sheet: the bag's Check out is the bar then.
    useEffect(() => {
        const look = () =>
            setSheetOpen(
                document.querySelector('[role="dialog"][aria-modal="true"]') !==
                    null,
            );
        look();
        const watch = new MutationObserver(look);
        watch.observe(document.body, { childList: true, subtree: true });
        return () => watch.disconnect();
    }, []);
    useEffect(() => {
        if (said === 0) return;
        const timer = setTimeout(() => setSlip(null), ADDED_SHOWN_MS);
        return () => clearTimeout(timer);
    }, [said]);
    useEffect(() => onBagShown(() => setSlip(null)), []);

    if (!selection) return null;
    const variantId = selection.variantId;
    const held =
        bag.find((i) => i.listingId === listingId && i.variantId === variantId)
            ?.quantity ?? 0;
    const room = !selection.soldOut && roomInBag(selection.left, held);
    const what = selection.variantTitle
        ? `${selection.name}, ${selection.variantTitle.toLowerCase()}`
        : selection.name;
    const price = !selection.currency
        ? ""
        : selection.payAmount
          ? formatAmount(selection.payAmount, selection.currency)
          : browsePriceWords(
                formatAmount(selection.price, selection.currency),
                selection.gstAdded === true,
            );

    function change(next: number) {
        if (next > held) {
            if (!room) return;
            const after = addToBag(site, { listingId, variantId, quantity: 1 });
            const inBag = after.some(
                (i) => i.listingId === listingId && i.variantId === variantId,
            );
            setFull(!inBag);
            if (inBag) {
                setSlip(what);
                setSaid((n) => n + 1);
            }
            return;
        }
        setFull(false);
        setSlip(null);
        setQuantity(site, { listingId, variantId }, next);
    }

    if (selection.soldOut) {
        return (
            <div
                data-look-add="sold-out"
                className="flex flex-wrap items-center gap-x-5 gap-y-1"
            >
                {/* "Sold out" is the page's own stock line, above. */}
                {askHref ? (
                    <a
                        href={askHref}
                        aria-label={`Ask about ${selection.name}`}
                        className={shopLink}
                    >
                        Ask about it
                    </a>
                ) : null}
                <a href={shopHref} className={shopLink}>
                    Back to the shop
                </a>
            </div>
        );
    }

    const count = bagCount(bag);
    const addButton = (bar: boolean) => (
        <button
            type="button"
            onClick={() => change(held + 1)}
            disabled={!room}
            // The page's one filled button; the bar's copy is chrome.
            {...(bar ? {} : { "data-site-primary": "" })}
            className={cn(
                shopPrimary(!room),
                "w-full justify-between min-[700px]:min-w-[18rem]",
            )}
        >
            <span>
                {!room && typeof selection.left === "number"
                    ? allInBagWords(selection.left)
                    : "Add to bag"}
            </span>
            {price && room ? <span>{price}</span> : null}
        </button>
    );

    return (
        <div data-look-add={held > 0 ? "in-bag" : "add"}>
            <div ref={main}>
                {held > 0 ? (
                    <div className="flex flex-wrap items-center gap-4">
                        <BagStepper
                            name={selection.name}
                            quantity={held}
                            canAdd={room}
                            onChange={change}
                        />
                        <span className="text-site-body text-[14.5px]">
                            {held} in your bag
                        </span>
                    </div>
                ) : (
                    addButton(false)
                )}
            </div>
            {full ? (
                <p
                    role="status"
                    className="text-site-fg mt-3 text-[14px] font-semibold"
                >
                    Your bag is full. Take something out to add this.
                </p>
            ) : null}

            {/* "Added to your bag", under the header: announced, never
                over the page's button, gone in 4 s or at the next tap. */}
            <div
                role="status"
                className="pointer-events-none fixed inset-x-0 top-[72px] z-50 flex justify-end px-[var(--site-page-margin,16px)]"
            >
                {slip ? (
                    <div
                        data-site-rise=""
                        data-added-slip=""
                        className="rounded-site-s border-site-border bg-site-surface text-site-fg pointer-events-auto w-full max-w-[360px] border p-4 shadow-[0_12px_32px_hsl(var(--site-fg)/0.14)]"
                    >
                        <p className={SHOP_LABEL}>Added to your bag</p>
                        <p className="mt-2 flex gap-3 text-[15px]">
                            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                1 × {slip}
                            </span>
                            {price ? (
                                <span className="tabular-nums">{price}</span>
                            ) : null}
                        </p>
                        <p className="text-site-body border-site-border mt-2 border-t border-dotted pt-2 text-[14px]">
                            Bag, {count} {count === 1 ? "item" : "items"}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSlip(null)}
                                className={shopOutline}
                            >
                                Keep shopping
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSlip(null);
                                    openBag();
                                }}
                                className={shopPrimary()}
                            >
                                View bag
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* The phone's bar: the same action, only while the page's own
                is off screen and no sheet is open. Chrome, so the page's
                one-filled-button count leaves it out. */}
            {!mainShown && !sheetOpen && held === 0 ? (
                <div
                    data-site-chrome-bar=""
                    data-look-bar=""
                    data-site-fade=""
                    className={cn(
                        "bg-site-bg fixed inset-x-0 bottom-[var(--site-consent-offset,0px)] z-40 px-[var(--site-page-margin,16px)] pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 min-[700px]:hidden",
                        look === "folio"
                            ? "border-site-fg border-t"
                            : "border-site-border border-t",
                    )}
                >
                    {addButton(true)}
                </div>
            ) : null}
        </div>
    );
}
