"use client";

import { useEffect, useState } from "react";

import { focusRing } from "../booking-flow/styles";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { ADDED_SHOWN_MS, allInBagWords, roomInBag } from "../shop/add-to-bag";
import { addToBag, openBag, useBag } from "../shop/bag-store";
import { chooseLabel, optionSummary } from "./option-summary";
import { formatAmount, percentOff } from "./product-page";

/**
 * The shop on a merchant's site (round-2 G11): `/shop`, a grid of every
 * product its sells-from storefront sells. Each card opens the product's
 * page. Where the site takes online orders (G13, `bagSite`), each card also
 * carries the design's button beside its price. A product with one option
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

/* The design's card button: the merchant's accent, the site's radius. */
const cardButton = cn(
    "bg-site-accent text-site-accent-fg inline-flex h-[38px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[var(--site-radius,2px)] px-3.5 text-[13.5px] font-bold transition-[opacity,transform] duration-100 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    focusRing,
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
}: {
    title?: string;
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

    return (
        <section className="mx-auto w-full max-w-[1120px] px-[18px] pb-10 pt-6">
            <h1 className="font-site-heading text-site-fg m-0 text-[clamp(32px,7vw,46px)] font-semibold leading-tight tracking-tight">
                {title}
            </h1>
            {lead ? (
                <p className="text-site-body mt-2 max-w-[60ch] text-[15px] leading-[1.55]">
                    {lead}
                </p>
            ) : null}
            {categories.length > 1 ? (
                <div
                    role="radiogroup"
                    aria-label="Category"
                    className="-mx-[18px] mt-4 flex gap-2 overflow-x-auto px-[18px] pb-1"
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
                                    "coarse:min-h-11 min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors duration-100 ease-out",
                                    focusRing,
                                    on
                                        ? "border-site-fg bg-site-fg text-site-bg"
                                        : "border-site-border bg-site-surface text-site-fg",
                                )}
                            >
                                {name ?? "All"}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {shown.map((p, index) => {
                    const amount = formatAmount(p.price, p.currency, locale);
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
                    return (
                        <li key={p.slug} className="relative min-w-0">
                            <a
                                href={href}
                                className="border-site-border bg-site-surface text-site-fg focus-visible:outline-site-accent grid h-full min-w-0 grid-rows-[auto_1fr] overflow-hidden rounded-[14px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                <span className="bg-site-bg relative block aspect-square">
                                    {p.image ? (
                                        <img
                                            src={p.image.url}
                                            alt={p.image.alt}
                                            // The first row is on the
                                            // first screen; the rest wait
                                            // until the visitor nears them.
                                            {...siteImage(
                                                index < 4 ? "above" : "below",
                                            )}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <span
                                            aria-hidden
                                            className="text-site-muted grid h-full place-items-center text-xs"
                                        >
                                            No photo yet
                                        </span>
                                    )}
                                </span>
                                <span className="flex min-w-0 flex-col gap-1.5 p-4">
                                    <span className="flex items-center gap-2">
                                        <span className="text-site-muted flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                            {optionSummary(
                                                p.variantTitles,
                                                p.optionName,
                                            )}
                                        </span>
                                        {p.soldOut ? (
                                            <span className="bg-site-fg text-site-bg rounded-full px-2 py-0.5 text-[11px] font-bold">
                                                Sold out
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="font-site-heading text-[19px] font-semibold leading-[1.2] tracking-[-0.015em]">
                                        {p.name}
                                    </span>
                                    {p.blurb ? (
                                        <span className="text-site-body text-[13.5px] leading-[1.5]">
                                            {p.blurb}
                                        </span>
                                    ) : null}
                                    <span
                                        className={cn(
                                            "mt-auto flex flex-wrap items-baseline gap-x-2 pt-1.5 text-base font-bold tabular-nums",
                                            // Room for the button beside it.
                                            canAdd &&
                                                "min-h-[38px] content-center items-center",
                                            // "Choose options" is wider.
                                            canAdd &&
                                                (choose ? "pr-36" : "pr-32"),
                                            p.soldOut && "text-site-muted",
                                        )}
                                    >
                                        {p.priceFrom
                                            ? `From ${amount}`
                                            : amount}
                                        {p.mrp &&
                                        !p.priceFrom &&
                                        percentOff(p.price, p.mrp) !== null ? (
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
                                    className={cn(
                                        cardButton,
                                        "absolute bottom-4 right-4",
                                    )}
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
                                                typeof p.bagLeft === "number"
                                              ? `${p.name}: ${allInBagWords(p.bagLeft).toLowerCase()}`
                                              : `Add ${p.name} to your bag`
                                    }
                                    className={cn(
                                        cardButton,
                                        "absolute bottom-4 right-4",
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
 * The shop, or one of its products, when the catalogue could not be read:
 * said plainly, in the site's palette, with nothing to click that cannot
 * work. A shop that isn't open is a 404, never this.
 */
export function ShopUnavailable({ business }: { business: string }) {
    return (
        <div className="bg-site-bg mx-auto max-w-[1060px] px-5 py-16">
            <div className="border-site-border bg-site-surface max-w-xl rounded-[14px] border p-5">
                <h1 className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em]">
                    We couldn&apos;t open the shop
                </h1>
                <p className="text-site-body mt-2 text-sm">
                    Something went wrong on our side. Try again in a moment, or
                    get in touch with {business} to order.
                </p>
            </div>
        </div>
    );
}
