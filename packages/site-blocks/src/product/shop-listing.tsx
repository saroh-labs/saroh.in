"use client";

import { cn } from "../lib/utils";
import { formatAmount, percentOff } from "./product-page";

/**
 * The shop on a merchant's site (round-2 G11): `/shop`, a grid of every
 * product its sells-from storefront sells. Each card opens the product's
 * page. Adding to a bag from the card arrives with the bag and checkout
 * (G13); until then the whole card is the link.
 *
 * Follows the Customer Site design's list page: the page title and a lead,
 * then cards of a photo, an eyebrow (the sizes it comes in), the name, two
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
    blurb: string | null;
    soldOut: boolean;
}

export default function ShopListing({
    title = "Shop",
    lead = null,
    products,
    basePath = "/shop",
    locale = "en-IN",
}: {
    title?: string;
    lead?: string | null;
    products: ShopListingCard[];
    /** Where product pages live: `/shop/<slug>`. */
    basePath?: string;
    locale?: string;
}) {
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
            <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {products.map((p) => {
                    const amount = formatAmount(p.price, p.currency, locale);
                    return (
                        <li key={p.slug} className="min-w-0">
                            <a
                                href={`${basePath}/${encodeURIComponent(p.slug)}`}
                                className="border-site-border bg-site-surface text-site-fg focus-visible:outline-site-accent grid h-full min-w-0 content-start overflow-hidden rounded-[14px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                <span className="bg-site-bg relative block h-[140px]">
                                    {p.image ? (
                                        <img
                                            src={p.image.url}
                                            alt={p.image.alt}
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
                                <span className="grid min-w-0 content-start gap-1.5 p-4">
                                    <span className="flex items-center gap-2">
                                        <span className="text-site-muted flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                            {p.variantTitles.join(" · ")}
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
                                            "mt-1.5 flex flex-wrap items-baseline gap-x-2 text-base font-bold tabular-nums",
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
                        </li>
                    );
                })}
            </ul>
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
