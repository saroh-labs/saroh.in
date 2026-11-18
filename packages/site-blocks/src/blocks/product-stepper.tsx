"use client";

import { cn } from "../lib/utils";
import { chooseLabel } from "../product/option-summary";
import type { ShopListingCard } from "../product/shop-listing";
import { roomInBag } from "../shop/add-to-bag";
import { BagStepper } from "../shop/bag-stepper";
import { addToBag, setQuantity, useBag } from "../shop/bag-store";

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const outline =
    "border-site-rule text-site-fg inline-flex min-h-11 w-full items-center justify-center rounded-[var(--site-radius)] border px-3.5 text-[14px] font-semibold";

/**
 * A Product grid card's order control (DEC-227, "Add to bag from the card"):
 * Add, which turns into the − / + stepper after the first tap — one control,
 * never both — so a customer fills the bag without leaving the page. It is
 * the shop's own bag (`bag-store.ts`) and stepper (`BagStepper`): the count
 * is what is in the bag now, said politely to a screen reader, and each
 * button is 44px. Sold out is said and can't be pressed. A product with
 * several options is chosen on its page, so it gets nothing here.
 *
 * `bagSite` null (the editor's canvas, or a site not taking orders) draws
 * Add as words that go nowhere on the canvas, and nothing on a live page.
 */
export function ProductStepper({
    product: p,
    bagSite,
    canvas = false,
}: {
    product: ShopListingCard;
    bagSite: string | null;
    canvas?: boolean;
}) {
    const bag = useBag(bagSite ?? "");
    // Several options: chosen on the product's page, which the card opens.
    if (chooseLabel(p.variantTitles, p.optionName)) return null;
    if (p.soldOut) {
        return (
            <button
                type="button"
                disabled
                data-stepper-sold-out=""
                className={cn(
                    outline,
                    "text-site-muted cursor-not-allowed border-dashed",
                )}
            >
                Sold out
            </button>
        );
    }
    if (!bagSite || !p.listingId) {
        return canvas ? <span className={outline}>Add</span> : null;
    }
    const listingId = p.listingId;
    const variantId = p.bagVariantId ?? null;
    const held =
        bag.find((i) => i.listingId === listingId && i.variantId === variantId)
            ?.quantity ?? 0;
    const change = (next: number) => {
        if (next > held) {
            if (!roomInBag(p.bagLeft, held)) return;
            addToBag(bagSite, { listingId, variantId, quantity: 1 });
            return;
        }
        setQuantity(bagSite, { listingId, variantId }, next);
    };
    if (held === 0) {
        return (
            <button
                type="button"
                onClick={() => change(1)}
                aria-label={`Add ${p.name} to your bag`}
                className={cn(
                    outline,
                    "hover:bg-site-surface cursor-pointer transition-[background-color,transform] active:scale-[0.98]",
                    focusRing,
                )}
            >
                Add
            </button>
        );
    }
    return (
        <BagStepper
            name={p.name}
            quantity={held}
            canAdd={roomInBag(p.bagLeft, held)}
            onChange={change}
            className="w-full justify-between"
        />
    );
}
