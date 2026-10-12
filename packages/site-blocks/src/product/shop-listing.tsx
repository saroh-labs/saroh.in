"use client";

import { useEffect, useState } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { browsePriceWords } from "../lib/gst-price";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import { ADDED_SHOWN_MS, allInBagWords, roomInBag } from "../shop/add-to-bag";
import { addToBag, onBagShown, openBag, useBag } from "../shop/bag-store";
import { SitePageState } from "../shop/page-state";
import { NamePlate } from "./name-plate";
import { chooseLabel, optionSummary } from "./option-summary";
import { formatAmount, percentOff } from "./product-page";

/**
 * The shop on a merchant's site (round-2 G11): `/shop`, a grid of every
 * product its sells-from storefront sells. Each card opens the product's
 * page. Where the site takes online orders (G13, `bagSite`), each card also
 * carries the design's button under its price. A product with one option
 * or none: "Add to bag" adds it and then reads "Add another". A product
 * with several: "Choose size" (the option's own name, `chooseLabel`) opens
 * its page, where one is picked; the card never adds a size nobody chose.
 * "Sold out" when nothing can be sold. The button sits outside the card's
 * link, so the rest of the card still opens the product.
 *
 * Follows the Customer Site design's list page: the page title and a lead,
 * then (where products are filed under two or more categories) a row of
 * chips to narrow the list, and cards of a square photo, an eyebrow (the sizes it comes in), the name, two
 * sentences and the price. Takes everything as props (all plain data) and
 * fetches nothing. A client module only because it shares the product
 * page's money helpers. Drawn from `--site-*` only.
 *
 * **A product with no photo** (starter audit, 12 Oct 2026) never shows an
 * empty frame, and "No photo yet" never reaches a customer. A shop with no
 * photos at all is a shop of text cards: a short rule in the accent, the
 * name a step larger, its line, the price and the button. Where some
 * products have a photo and some don't, the ones without take a quiet panel
 * with their name in the photo's own square (`NamePlate`), so the row
 * lines up.
 *
 * Two cards across on a phone from 380px (one under it); from the tablet
 * width the cards fill the row at 240px or more. The button is the card's
 * full width, 44px, under the price at every width.
 */

/** One product on the shop, as the public catalogue serves it. */
export interface ShopListingCard {
    slug: string;
    name: string;
    currency: string;
    price: string;
    mrp: string | null;
    /** The price is the lowest of several: "From ₹250". */
    priceFrom: boolean;
    /**
     * GST comes on top of the price: the card says "+ GST" after it, so
     * the amount to pay is no surprise. Absent from an older API: no.
     */
    gstAdded?: boolean;
    image: { url: string; alt: string } | null;
    variantTitles: string[];
    /**
     * What the options are ("Size", DEC-073 #12). Absent from an API before
     * it; the card then says "2 options".
     */
    optionName?: string | null;
    blurb: string | null;
    /**
     * The category the merchant filed it under; the shop offers these as
     * chips. Null for none; absent from an older API.
     */
    categoryName?: string | null;
    soldOut: boolean;
    /** The listing at the site's storefront: what the bag holds (G13). */
    listingId?: string;
    /**
     * The option the card's Add to bag adds; null for none. Read only for
     * a product with one option on offer: with several, the card sends the
     * customer to the product page to choose.
     */
    bagVariantId?: string | null;
    /**
     * How many of that option can go in the bag, where the product page
     * would say "Only N left"; null or absent when it isn't counted out.
     * Add another stops there (UX-058), as the product page's does.
     */
    bagLeft?: number | null;
}

/*
 * The card's button: the merchant's accent, the site's radius, 44px, as
 * wide as the card and under the price at every width. Beside the price
 * it took the price's room: "From ₹1,250" broke over two lines, and a
 * price in another currency ran under it. One that can't be pressed (sold
 * out, all in the bag) goes quiet rather than faded, so its words read.
 */
const cardButton = (off: boolean) =>
    cn(
        "absolute inset-x-3.5 bottom-3.5 inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[calc(var(--site-radius,2px)+6px)] px-3.5 text-sm font-bold transition-[opacity,transform] duration-100 ease-out sm:inset-x-4 sm:bottom-4",
        focusRing,
        off
            ? cn("text-site-body cursor-not-allowed", quietFill)
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90 active:scale-[0.98]",
    );

/**
 * The categories a list of products is filed under, each once, in the
 * order they first appear. A product with none is in no category, and
 * shows under "All".
 */
export function categoriesOf(
    products: readonly Pick<ShopListingCard, "categoryName">[],
): string[] {
    const names: string[] = [];
    for (const p of products) {
        const name = p.categoryName?.trim();
        if (name && !names.includes(name)) names.push(name);
    }
    return names;
}

export default function ShopListing({
    title = "Shop",
    lead = null,
    products,
    basePath = "/shop",
    locale = "en-IN",
    bagSite = null,
    business = null,
    reach = null,
}: {
    title?: string;
    /**
     * One line under the heading: how an order reaches the customer
     * (`shopLeadLine`, from the location's checkout). Null draws none.
     */
    lead?: string | null;
    products: ShopListingCard[];
    /** Where product pages live: `/shop/<slug>`. */
    basePath?: string;
    locale?: string;
    /**
     * The site whose bag the cards add to, when it takes online orders
     * (G13). Null: no bag, and no button on the cards.
     */
    bagSite?: string | null;
    /** The business's name, for a shop with nothing on sale yet. */
    business?: string | null;
    /** A call and a message, offered where there is nothing to buy. */
    reach?: BusinessReach | null;
}) {
    const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
    const [notice, setNotice] = useState<string | null>(null);
    // The shop's chips: the categories its products are filed under, in
    // the order they first appear. Offered only when there is a choice to
    // make (two or more). "All" is where the page opens.
    const categories = categoriesOf(products);
    const [category, setCategory] = useState<string | null>(null);
    const picked = categories.includes(category ?? "") ? category : null;
    const shown = picked
        ? products.filter((p) => p.categoryName?.trim() === picked)
        : products;
    // "‹Product› added to your bag." goes by itself after four seconds: it
    // has said what happened, and it sits over the page. Each add says it
    // afresh (`said` counts them). "Your bag is full" stays until the next
    // thing happens: it is why nothing was added.
    const [said, setSaid] = useState(0);
    useEffect(() => {
        if (said === 0) return;
        const timer = setTimeout(() => setNotice(null), ADDED_SHOWN_MS);
        return () => clearTimeout(timer);
    }, [said]);
    useEffect(() => onBagShown(() => setNotice(null)), []);
    const bag = useBag(bagSite ?? "");

    /** How many of the card's option the bag holds now. */
    function heldOf(p: ShopListingCard): number {
        const variantId = p.bagVariantId ?? null;
        return (
            bag.find(
                (i) => i.listingId === p.listingId && i.variantId === variantId,
            )?.quantity ?? 0
        );
    }

    function add(p: ShopListingCard) {
        if (!bagSite || !p.listingId || p.soldOut) return;
        // Not past what is left (UX-058), as the product page stops.
        if (!roomInBag(p.bagLeft, heldOf(p))) return;
        const variantId = p.bagVariantId ?? null;
        const bag = addToBag(bagSite, {
            listingId: p.listingId,
            variantId,
            quantity: 1,
        });
        // A full bag keeps what it had: say so, never "added".
        const inBag = bag.some(
            (i) => i.listingId === p.listingId && i.variantId === variantId,
        );
        if (!inBag) {
            setNotice("Your bag is full. Take something out to add this.");
            return;
        }
        setAdded((was) => new Set(was).add(p.slug));
        setNotice(`${p.name} added to your bag.`);
        setSaid((n) => n + 1);
    }

    // A shop with no photos at all is a shop of text cards, composed as
    // such. Where only some products have one, the others take a panel in
    // the photo's place, so the row still lines up.
    const anyPhoto = shown.some((p) => p.image !== null);
    // The options and Sold out share a row over the name. It is kept on
    // every card when any card has one, so the names line up along a row.
    const anyEyebrow = shown.some(
        (p) => p.soldOut || optionSummary(p.variantTitles, p.optionName) !== "",
    );

    return (
        <section className="max-w-site-content mx-auto w-full px-5 pb-14 pt-10 sm:px-[var(--site-page-margin)] sm:pb-20 sm:pt-[var(--site-section-padding)]">
            <h1 className="font-site-heading text-site-fg m-0 text-[calc(clamp(2rem,7vw,2.875rem)*var(--site-heading-scale,1))] font-semibold leading-[1.08] tracking-[-0.02em] [text-wrap:balance]">
                {title}
            </h1>
            {lead ? (
                <p
                    data-shop-lead=""
                    className="text-site-body mt-3 max-w-[60ch] text-base leading-[1.55] [text-wrap:pretty]"
                >
                    {lead}
                </p>
            ) : null}
            {categories.length > 1 ? (
                <div
                    role="radiogroup"
                    aria-label="Category"
                    // One line that scrolls on a phone, bled to the
                    // screen's edge; rows that wrap from the tablet width.
                    className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 pt-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
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
                                    "coarse:min-h-11 min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-100 ease-out active:scale-[0.97]",
                                    focusRing,
                                    on
                                        ? "border-site-fg bg-site-fg text-site-bg"
                                        : "border-site-border bg-site-surface text-site-fg hover:border-site-fg",
                                )}
                            >
                                {name ?? "All"}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {products.length === 0 ? (
                <ShopEmpty business={business} reach={reach} />
            ) : (
                <ul
                    className={cn(
                        "grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]",
                        categories.length > 1 ? "mt-5" : "mt-7",
                    )}
                >
                    {shown.map((p, index) => {
                        const amount = browsePriceWords(
                            formatAmount(p.price, p.currency, locale),
                            p.gstAdded === true,
                        );
                        const canAdd = Boolean(bagSite && p.listingId);
                        const href = `${basePath}/${encodeURIComponent(p.slug)}`;
                        // Several options: chosen on the product's page.
                        const choose = p.soldOut
                            ? null
                            : chooseLabel(p.variantTitles, p.optionName);
                        // Everything left is in the bag already (UX-058).
                        const allIn =
                            canAdd &&
                            !p.soldOut &&
                            typeof p.bagLeft === "number" &&
                            !roomInBag(p.bagLeft, heldOf(p));
                        const eyebrow = optionSummary(
                            p.variantTitles,
                            p.optionName,
                        );
                        return (
                            <li key={p.slug} className="relative min-w-0">
                                <a
                                    href={href}
                                    data-card={
                                        p.image
                                            ? "photo"
                                            : anyPhoto
                                              ? "plate"
                                              : "text"
                                    }
                                    className={cn(
                                        "border-site-border bg-site-surface text-site-fg hover:border-site-fg/40 group flex h-full min-w-0 flex-col overflow-hidden rounded-[calc(var(--site-radius,2px)+10px)] border transition-[border-color] duration-150 ease-out",
                                        focusRing,
                                    )}
                                >
                                    {p.image ? (
                                        <span className="bg-site-bg relative block aspect-square overflow-hidden">
                                            <img
                                                src={p.image.url}
                                                alt={p.image.alt}
                                                // The box is square whatever
                                                // the file is; these keep
                                                // its room until it arrives.
                                                width={600}
                                                height={600}
                                                // The first row is on the
                                                // first screen; the rest
                                                // wait until the visitor
                                                // nears them.
                                                {...siteImage(
                                                    index < 4
                                                        ? "above"
                                                        : "below",
                                                )}
                                                className="h-full w-full object-cover transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
                                            />
                                        </span>
                                    ) : anyPhoto ? (
                                        <NamePlate
                                            name={p.name}
                                            className="aspect-square"
                                        />
                                    ) : null}
                                    <span
                                        className={cn(
                                            "flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:p-4",
                                            // Room for the button under the
                                            // price.
                                            canAdd &&
                                                "pb-[4.5rem] sm:pb-[4.75rem]",
                                        )}
                                    >
                                        {!anyPhoto ? (
                                            <span
                                                aria-hidden="true"
                                                className="bg-site-accent mb-2 block h-0.5 w-7"
                                            />
                                        ) : null}
                                        {anyEyebrow ? (
                                            <span className="flex min-h-5 items-center gap-2">
                                                <span className="text-site-muted min-w-0 flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                                    {eyebrow}
                                                </span>
                                                {p.soldOut ? (
                                                    <span className="bg-site-fg text-site-bg shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
                                                        Sold out
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : null}
                                        <span
                                            className={cn(
                                                "font-site-heading font-semibold leading-[1.2] tracking-[-0.015em] underline-offset-4 [overflow-wrap:anywhere] group-hover:underline",
                                                anyPhoto
                                                    ? "text-[calc(1.0625rem*var(--site-heading-scale,1))] sm:text-[calc(1.1875rem*var(--site-heading-scale,1))]"
                                                    : "text-[calc(1.1875rem*var(--site-heading-scale,1))] sm:text-[calc(1.3125rem*var(--site-heading-scale,1))]",
                                            )}
                                        >
                                            {p.name}
                                        </span>
                                        {p.blurb ? (
                                            <span className="text-site-body line-clamp-3 text-sm leading-[1.5] sm:line-clamp-4">
                                                {p.blurb}
                                            </span>
                                        ) : null}
                                        <span
                                            className={cn(
                                                "mt-auto flex flex-wrap items-baseline gap-x-2 pt-2 text-base font-bold tabular-nums",
                                                p.soldOut && "text-site-muted",
                                            )}
                                        >
                                            {p.priceFrom
                                                ? `From ${amount}`
                                                : amount}
                                            {p.mrp &&
                                            !p.priceFrom &&
                                            percentOff(p.price, p.mrp) !==
                                                null ? (
                                                <span className="text-site-muted text-sm font-normal line-through">
                                                    <span className="sr-only">
                                                        MRP{" "}
                                                    </span>
                                                    {formatAmount(
                                                        p.mrp,
                                                        p.currency,
                                                        locale,
                                                    )}
                                                </span>
                                            ) : null}
                                        </span>
                                    </span>
                                </a>
                                {canAdd && choose ? (
                                    <a
                                        href={href}
                                        aria-label={`${choose} for ${p.name}`}
                                        className={cardButton(false)}
                                    >
                                        {choose}
                                    </a>
                                ) : canAdd ? (
                                    <button
                                        type="button"
                                        onClick={() => add(p)}
                                        disabled={p.soldOut || allIn}
                                        aria-label={
                                            p.soldOut
                                                ? `${p.name}: sold out`
                                                : allIn &&
                                                    typeof p.bagLeft ===
                                                        "number"
                                                  ? `${p.name}: ${allInBagWords(p.bagLeft).toLowerCase()}`
                                                  : `Add ${p.name} to your bag`
                                        }
                                        className={cardButton(
                                            p.soldOut || allIn,
                                        )}
                                    >
                                        {p.soldOut
                                            ? "Sold out"
                                            : allIn
                                              ? "In your bag"
                                              : added.has(p.slug)
                                                ? "Add another"
                                                : "Add to bag"}
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
            {bagSite ? (
                <div
                    role="status"
                    className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--site-consent-offset,0px))] z-40 flex justify-center px-4"
                >
                    {notice ? (
                        <p className="bg-site-fg text-site-bg pointer-events-auto flex max-w-[min(100%,420px)] flex-wrap items-center gap-x-3 gap-y-1 rounded-[calc(var(--site-radius,2px)*2)] px-4 py-2.5 text-sm shadow-lg">
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                {notice}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setNotice(null);
                                    openBag();
                                }}
                                className={cn(
                                    "shrink-0 cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:no-underline active:opacity-80",
                                    focusRing,
                                )}
                            >
                                View bag
                            </button>
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

/**
 * A shop with nothing on sale: said under the heading, with the ways to
 * reach the business when the site shows them. The API answers a 404 for a
 * shop that sells nothing, so this is the net under a list that came back
 * empty all the same. Never a bare heading over a blank page.
 */
function ShopEmpty({
    business,
    reach,
}: {
    business: string | null;
    reach: BusinessReach | null;
}) {
    return (
        <div
            data-shop-empty=""
            className="border-site-border mt-7 max-w-[34rem] border-t pt-6"
        >
            <h2 className="font-site-heading text-site-fg text-[calc(1.3125rem*var(--site-heading-scale,1))] font-semibold leading-tight tracking-[-0.015em]">
                No products yet
            </h2>
            <p className="text-site-body mt-2 text-base leading-[1.55]">
                {business
                    ? `${business} hasn't put anything on sale here yet. Come back soon.`
                    : "Nothing is on sale here yet. Come back soon."}
            </p>
            <ReachLinks reach={reach} className="mt-2" />
        </div>
    );
}

/**
 * The shop, or one of its products, when the catalogue could not be read:
 * said plainly, in the site's palette, with a way to ask again and the ways
 * to reach the business. A shop that isn't open is a 404, never this.
 */
export function ShopUnavailable({
    business,
    retryHref = null,
    reach = null,
}: {
    business: string;
    /** The page's own address: "Try again" asks for it afresh. */
    retryHref?: string | null;
    /** A call and a message, when the site shows them. */
    reach?: BusinessReach | null;
}) {
    return (
        <SitePageState
            title="We couldn't open the shop"
            failed
            retryHref={retryHref}
            reach={reach}
        >
            Something went wrong on our side. Try again in a moment, or get in
            touch with {business} to order.
        </SitePageState>
    );
}
