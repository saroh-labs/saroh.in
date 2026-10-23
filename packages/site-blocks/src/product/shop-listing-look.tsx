"use client";

import type { LookId } from "@saroh/block-contract";
import { useState } from "react";

import { browsePriceWords } from "../lib/gst-price";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { showsCount } from "../live/live-state";
import { useLiveRead } from "../live/use-live-read";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import { roomInBag } from "../shop/add-to-bag";
import { BagStepper } from "../shop/bag-stepper";
import { addToBag, setQuantity, useBag } from "../shop/bag-store";
import {
    SHOP_LABEL,
    SHOP_TITLE,
    shopLink,
    shopOutline,
} from "../shop/look-shop";
import { NamePlate } from "./name-plate";
import { chooseLabel } from "./option-summary";
import { formatAmount } from "./product-page";
import type { ShopListingCard } from "./shop-listing";
import { cardSaving, categoriesOf } from "./shop-listing";

/**
 * The shop under a look (DEC-172, plan U11, #1102): the boards VA12, VD12
 * and VB12. The same products, the same categories, the same Add to bag
 * and Choose as Classic's `ShopListing` — only the frame differs.
 *
 * - **Folio** (VA12): the title in the display face beside its line, one
 *   ruled line about when, categories as tabs; one product to a row on a
 *   phone and three on a desk, on the ground colour with no card.
 * - **Quiet** (VD12): all of that centred and airy; two to a row on a
 *   phone, three on a desk; pill outlines.
 * - **Live** (VB12): the products as quick-add rows in a white card on a
 *   phone and as white cards on a desk, with "6 left" read in the browser.
 *
 * WHAT THE PAGE PROMISES. One line, said once: the owner's own cut-off line
 * when they wrote one ("Order by 9 pm"), then how an order reaches the
 * customer and what it costs, from the location's checkout now
 * (`shopFactsLine`). Nothing is worked out from the clock here: this page
 * is kept by the page cache, so a "today" or a "ready from" would go stale.
 * When it is ready is said in checkout, from the business hours. No
 * product adds a date: no pre-order, no back-in-stock, no notify list.
 *
 * THE STEPPER (owner, 20 Oct): Add to bag is an outline; once a product's
 * option is in the bag the button is the − 1 + stepper showing how many
 * are in the bag, and − to 0 turns it back. The view's one filled button is
 * the bag's Check out, never a card's.
 *
 * SOLD OUT says "Sold out", with "Ask about it" where the site has a way to
 * ask, and no dead button.
 *
 * "N LEFT" (Live) comes from the shop's public read in the browser
 * (`useLiveRead`), shown only while fresh and only at 5 or fewer: the cached
 * HTML never carries a count, and when the read fails the counts hide and
 * Add still works.
 */

/** Counts show at this many or fewer: anything more isn't news. */
const LEFT_SHOWN_AT_MOST = 5;

/** "6 left" never: only 5 or fewer, and 1 is "Last one". */
export function leftWords(left: number | null | undefined): string | null {
    if (left === null || left === undefined || !Number.isFinite(left)) {
        return null;
    }
    if (left <= 0 || left > LEFT_SHOWN_AT_MOST) return null;
    return left === 1 ? "Last one" : `${left} left`;
}

/** The owner's line without its closing full stops and spaces, in one pass. */
function withoutEndStops(line: string): string {
    let end = line.length;
    while (end > 0 && (line[end - 1] === "." || /\s/.test(line[end - 1] ?? "")))
        end -= 1;
    return line.slice(0, end);
}

/** What the one line about when reads: the owner's line, then the facts. */
export function shopWhenLine(
    cutOff: string | null | undefined,
    facts: string | null | undefined,
): string | null {
    const own = withoutEndStops(cutOff?.trim() ?? "");
    const parts = [own || null, facts?.trim() ? facts.trim() : null].filter(
        (p): p is string => Boolean(p),
    );
    if (parts.length === 0) return null;
    return `${parts.join(". ")}.`;
}

/**
 * The slug → left map from the shop's live counts
 * (`GET /public/sites/:siteId/shop/stock`, review #21); undefined if bad.
 */
export function parseLeft(
    body: unknown,
): Record<string, number | null> | undefined {
    const items =
        body && typeof body === "object"
            ? (body as { items?: unknown }).items
            : undefined;
    if (!Array.isArray(items)) return undefined;
    const map: Record<string, number | null> = {};
    for (const item of items as unknown[]) {
        if (!item || typeof item !== "object") return undefined;
        const { slug, left } = item as { slug?: unknown; left?: unknown };
        if (typeof slug !== "string") return undefined;
        map[slug] = typeof left === "number" ? left : null;
    }
    return map;
}

function ClockMark() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="mt-[3px] shrink-0"
        >
            <circle
                cx="12"
                cy="12"
                r="8.25"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M12 7.5V12l3 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function LookShopListing({
    look,
    title = "Shop",
    lead = null,
    facts = null,
    cutOff = null,
    products,
    basePath = "/shop",
    locale = "en-IN",
    bagSite = null,
    business = null,
    reach = null,
    askHref = null,
    apiUrl = null,
}: {
    look: LookId;
    title?: string;
    /** The shop's line under its title (`shopLeadLine`); null draws none. */
    lead?: string | null;
    /** What it costs to receive (`shopFactsLine`); null when not ordering. */
    facts?: string | null;
    /** The owner's own cut-off line, as written; null or empty draws none. */
    cutOff?: string | null;
    products: ShopListingCard[];
    basePath?: string;
    locale?: string;
    /** The site whose bag the cards add to; null: no bag, no buttons. */
    bagSite?: string | null;
    business?: string | null;
    reach?: BusinessReach | null;
    /** Where "Ask about it" leads for a sold-out product; null: none. */
    askHref?: string | null;
    /** The public API, for Live's "N left" in the browser; null: none. */
    apiUrl?: string | null;
}) {
    const categories = categoriesOf(products);
    const [category, setCategory] = useState<string | null>(null);
    const picked = categories.includes(category ?? "") ? category : null;
    const shown = picked
        ? products.filter((p) => p.categoryName?.trim() === picked)
        : products;
    const bag = useBag(bagSite ?? "");
    const [full, setFull] = useState(false);

    const liveUrl =
        look === "live" && bagSite && apiUrl
            ? `${apiUrl}/public/sites/${encodeURIComponent(bagSite)}/shop/stock`
            : null;
    const live = useLiveRead(liveUrl, parseLeft);

    const anyPhoto = shown.some((p) => p.image !== null);
    const when = shopWhenLine(cutOff, facts);

    function heldOf(p: ShopListingCard): number {
        const variantId = p.bagVariantId ?? null;
        return (
            bag.find(
                (i) => i.listingId === p.listingId && i.variantId === variantId,
            )?.quantity ?? 0
        );
    }

    function change(p: ShopListingCard, next: number) {
        if (!bagSite || !p.listingId) return;
        const variantId = p.bagVariantId ?? null;
        const held = heldOf(p);
        if (next > held) {
            if (p.soldOut || !roomInBag(p.bagLeft, held)) return;
            const after = addToBag(bagSite, {
                listingId: p.listingId,
                variantId,
                quantity: 1,
            });
            // A full bag keeps what it had: say so, never "added".
            setFull(
                !after.some(
                    (i) =>
                        i.listingId === p.listingId &&
                        i.variantId === variantId,
                ),
            );
            return;
        }
        setFull(false);
        setQuantity(bagSite, { listingId: p.listingId, variantId }, next);
    }

    const centred = look === "quiet";

    return (
        <section
            data-shop-look={look}
            className="max-w-site-content mx-auto w-full px-[var(--site-page-margin,20px)] pb-[var(--site-section-padding,64px)] pt-10 min-[700px]:pt-[calc(var(--site-section-padding,64px)*0.6)]"
        >
            <header
                className={cn(
                    look === "folio" &&
                        "min-[1000px]:grid min-[1000px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] min-[1000px]:items-end min-[1000px]:gap-12",
                    centred && "min-[700px]:text-center",
                )}
            >
                <div className="min-w-0">
                    <p className={SHOP_LABEL}>Shop</p>
                    <h1 className={cn(SHOP_TITLE[look], "mt-3")}>{title}</h1>
                </div>
                {lead ? (
                    <p
                        data-shop-lead=""
                        className={cn(
                            "text-site-body mt-4 max-w-[60ch] text-[16px] leading-[1.6] [text-wrap:pretty]",
                            centred && "min-[700px]:mx-auto",
                        )}
                    >
                        {lead}
                    </p>
                ) : null}
            </header>

            {when ? (
                <p
                    data-shop-when=""
                    className={cn(
                        "text-site-body mt-7 flex gap-3 text-[14.5px] leading-[1.55]",
                        look === "folio" &&
                            "border-site-fg border-b border-t py-3.5",
                        look === "live" &&
                            "rounded-site-photo bg-site-surface px-4 py-3",
                        centred && "min-[700px]:justify-center",
                    )}
                >
                    <ClockMark />
                    <span className="min-w-0">{when}</span>
                </p>
            ) : null}

            {categories.length > 1 ? (
                <div
                    role="radiogroup"
                    aria-label="Category"
                    className={cn(
                        "-mx-[var(--site-page-margin,20px)] mt-6 flex overflow-x-auto px-[var(--site-page-margin,20px)] pb-1 min-[700px]:mx-0 min-[700px]:flex-wrap min-[700px]:px-0",
                        look === "live"
                            ? "gap-2"
                            : "border-site-border gap-6 border-b",
                        centred && "min-[700px]:justify-center",
                    )}
                >
                    {[null, ...categories].map((name) => {
                        const on = picked === name;
                        return (
                            <button
                                key={name ?? ""}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setCategory(name)}
                                className={cn(
                                    "min-h-11 shrink-0 cursor-pointer whitespace-nowrap text-[15px]",
                                    LOOK_RING,
                                    LOOK_EASE,
                                    look === "live"
                                        ? cn(
                                              "rounded-site px-4 font-semibold",
                                              on
                                                  ? "bg-site-fg text-site-bg"
                                                  : "bg-site-surface text-site-fg",
                                          )
                                        : cn(
                                              "-mb-px border-b-2",
                                              on
                                                  ? "border-site-fg text-site-fg"
                                                  : "text-site-body hover:text-site-fg border-transparent",
                                          ),
                                )}
                            >
                                {name ?? "Everything"}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            {products.length === 0 ? (
                <div data-shop-empty="" className="mt-8 max-w-[34rem]">
                    <h2 className="font-site-heading text-site-fg text-[calc(1.5rem*var(--site-heading-scale,1))] leading-tight">
                        No products yet
                    </h2>
                    <p className="text-site-body mt-2 text-base leading-[1.55]">
                        {business
                            ? `${business} hasn't put anything on sale here yet. Come back soon.`
                            : "Nothing is on sale here yet. Come back soon."}
                    </p>
                    <ReachLinks reach={reach} className="mt-2" />
                </div>
            ) : (
                <ul
                    data-shop-grid={look}
                    className={cn(
                        "m-0 list-none p-0",
                        look === "folio" &&
                            "mt-8 grid grid-cols-1 gap-x-10 gap-y-12 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3",
                        look === "quiet" &&
                            "mt-8 grid grid-cols-2 gap-x-4 gap-y-10 min-[700px]:gap-x-12 min-[1000px]:grid-cols-3 min-[1000px]:gap-y-14",
                        look === "live" &&
                            "rounded-site-photo bg-site-surface max-[699px]:divide-site-border mt-5 px-4 max-[699px]:divide-y min-[700px]:grid min-[700px]:grid-cols-2 min-[700px]:gap-4 min-[700px]:bg-transparent min-[700px]:px-0 min-[1000px]:grid-cols-3",
                    )}
                >
                    {shown.map((p, index) => {
                        const amount = browsePriceWords(
                            formatAmount(p.price, p.currency, locale),
                            p.gstAdded === true,
                        );
                        const price = p.priceFrom ? `From ${amount}` : amount;
                        const saving = cardSaving(p);
                        const href = `${basePath}/${encodeURIComponent(p.slug)}`;
                        const canAdd = Boolean(bagSite && p.listingId);
                        const choose = p.soldOut
                            ? null
                            : chooseLabel(p.variantTitles, p.optionName);
                        const held = heldOf(p);
                        const room = !p.soldOut && roomInBag(p.bagLeft, held);
                        const left =
                            live.data && showsCount(live.status)
                                ? leftWords(live.data[p.slug])
                                : null;

                        const action = p.soldOut ? (
                            <span className="flex min-h-11 flex-wrap items-center gap-x-4">
                                <span
                                    data-sold-out=""
                                    className="text-site-fg text-[14px] font-semibold"
                                >
                                    Sold out
                                </span>
                                {askHref ? (
                                    <a
                                        href={askHref}
                                        aria-label={`Ask about ${p.name}`}
                                        className={shopLink}
                                    >
                                        Ask about it
                                    </a>
                                ) : null}
                            </span>
                        ) : !canAdd ? null : choose ? (
                            <a
                                href={href}
                                aria-label={`${choose} for ${p.name}`}
                                className={shopOutline}
                            >
                                {choose}
                            </a>
                        ) : held > 0 ? (
                            <BagStepper
                                name={p.name}
                                quantity={held}
                                canAdd={room}
                                onChange={(next) => change(p, next)}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => change(p, 1)}
                                aria-label={`Add ${p.name} to your bag`}
                                className={shopOutline}
                            >
                                {look === "live" ? (
                                    <>
                                        <span aria-hidden="true">+</span> Add
                                    </>
                                ) : (
                                    "Add to bag"
                                )}
                            </button>
                        );

                        const photo = p.image ? (
                            <img
                                src={p.image.url}
                                alt={p.image.alt}
                                width={600}
                                height={750}
                                {...siteImage(index < 3 ? "above" : "below", {
                                    src: p.image.url,
                                    sizes:
                                        look === "live"
                                            ? "(min-width: 700px) 33vw, 96px"
                                            : "(min-width: 1000px) 33vw, (min-width: 700px) 50vw, 100vw",
                                })}
                                className="h-full w-full object-cover"
                            />
                        ) : anyPhoto ? (
                            <NamePlate
                                name={p.name}
                                className="h-full w-full"
                            />
                        ) : null;

                        if (look === "live") {
                            return (
                                <li
                                    key={p.slug}
                                    className="min-[700px]:rounded-site-photo min-[700px]:bg-site-surface relative flex min-w-0 items-center gap-4 py-4 min-[700px]:flex-col min-[700px]:items-stretch min-[700px]:p-2.5"
                                >
                                    {photo ? (
                                        <span className="rounded-site-photo block size-[88px] shrink-0 overflow-hidden min-[700px]:aspect-[16/10] min-[700px]:size-auto min-[700px]:w-full">
                                            {photo}
                                        </span>
                                    ) : null}
                                    <span className="flex min-w-0 flex-1 flex-col gap-1 min-[700px]:px-2">
                                        <a
                                            href={href}
                                            className={cn(
                                                "font-site-heading text-site-fg rounded-sm text-[17px] font-bold leading-snug [overflow-wrap:anywhere] hover:underline",
                                                LOOK_RING,
                                            )}
                                        >
                                            {p.name}
                                        </a>
                                        {p.blurb ? (
                                            <span className="text-site-body line-clamp-2 text-[14px] leading-snug">
                                                {p.blurb}
                                            </span>
                                        ) : null}
                                        <span className="mt-1 flex flex-wrap items-center gap-2">
                                            <span className="text-site-fg text-[18px] font-bold tabular-nums">
                                                {price}
                                            </span>
                                            {saving ? (
                                                <MrpLine
                                                    saving={saving}
                                                    currency={p.currency}
                                                    locale={locale}
                                                />
                                            ) : null}
                                            {/* Reserved height: a count
                                                that arrives moves nothing. */}
                                            <span
                                                data-left=""
                                                className="inline-flex min-h-6 items-center"
                                            >
                                                {left ? (
                                                    <span className="bg-site-fg text-site-bg rounded-site-s px-2 py-0.5 text-[12.5px] font-bold">
                                                        {left}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="shrink-0 min-[700px]:self-start min-[700px]:px-2 min-[700px]:pb-2">
                                        {action}
                                    </span>
                                </li>
                            );
                        }

                        return (
                            <li
                                key={p.slug}
                                className="relative flex min-w-0 flex-col"
                            >
                                {photo ? (
                                    <a
                                        href={href}
                                        tabIndex={-1}
                                        aria-hidden="true"
                                        className="rounded-site-photo block aspect-[4/5] overflow-hidden"
                                    >
                                        {photo}
                                    </a>
                                ) : null}
                                <span
                                    className={cn(
                                        "mt-4 flex min-w-0 gap-3",
                                        look === "quiet"
                                            ? "flex-col gap-2 min-[700px]:flex-row min-[700px]:items-baseline"
                                            : "items-baseline",
                                    )}
                                >
                                    <a
                                        href={href}
                                        className={cn(
                                            "font-site-heading text-site-fg min-w-0 flex-1 rounded-sm leading-tight [overflow-wrap:anywhere] hover:underline",
                                            look === "folio"
                                                ? "text-[calc(1.375rem*var(--site-heading-scale,1))] font-light"
                                                : "text-[calc(1.25rem*var(--site-heading-scale,1))] min-[700px]:text-[calc(1.5rem*var(--site-heading-scale,1))]",
                                            LOOK_RING,
                                        )}
                                    >
                                        {p.name}
                                    </a>
                                    <span className="text-site-fg shrink-0 text-[16px] font-semibold tabular-nums">
                                        {price}
                                    </span>
                                </span>
                                {p.blurb ? (
                                    <span className="text-site-body mt-1.5 line-clamp-3 text-[14px] leading-[1.5]">
                                        {p.blurb}
                                    </span>
                                ) : null}
                                {saving ? (
                                    <span className="mt-1.5">
                                        <MrpLine
                                            saving={saving}
                                            currency={p.currency}
                                            locale={locale}
                                        />
                                    </span>
                                ) : null}
                                {action ? (
                                    <span className="mt-4">{action}</span>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            {full ? (
                <p
                    role="status"
                    className="text-site-fg mt-6 text-[14.5px] font-semibold"
                >
                    Your bag is full. Take something out to add this.
                </p>
            ) : null}
        </section>
    );
}

/** "MRP ₹720 · you save ₹70", the MRP struck through. */
function MrpLine({
    saving,
    currency,
    locale,
}: {
    saving: NonNullable<ReturnType<typeof cardSaving>>;
    currency: string;
    locale: string;
}) {
    return (
        <span data-card-mrp="" className="text-site-body text-[13.5px]">
            MRP{" "}
            <span className="line-through">
                {formatAmount(saving.mrp, currency, locale)}
            </span>
            {saving.percent > 0 ? ` · ${saving.percent}% off` : null}
        </span>
    );
}
