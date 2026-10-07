import { formatAmount } from "../lib/money";
import { cn } from "../lib/utils";
import { optionSummary } from "../product/option-summary";
import type { ShopListingCard } from "../product/shop-listing";

/**
 * The Product grid's `lead` look (industry templates U2): the first product
 * takes twice the room — two columns and two rows from the tablet width up —
 * and every card has a tall photo (4:5), its name, the price set large and
 * its line. On a phone it is one column, the lead first. The ceramics and
 * bakery designs' counter.
 *
 * Sold out is said in words, on the card and in its link's name, never by
 * colour or a faded photo alone. Drawn from `--site-*` only (gate G2).
 */

export interface LeadShow {
    price: boolean;
    photo: boolean;
    line: boolean;
    label: string | null;
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export function LeadGrid({
    products,
    show,
    base,
    line,
}: {
    products: ShopListingCard[];
    show: LeadShow;
    /** Where product pages live; null draws the cards without links. */
    base: string | null;
    /** The card's line from a product's blurb (the grid's own rule). */
    line: (blurb: string | null) => string | null;
}) {
    return (
        <ul className="grid grid-cols-1 gap-[var(--site-grid-gap,0.75rem)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => {
                const lead = i === 0;
                const body = (
                    <LeadCard
                        product={p}
                        show={show}
                        lead={lead}
                        line={show.line ? line(p.blurb) : null}
                    />
                );
                const card =
                    "text-site-fg grid h-full min-w-0 content-start gap-2";
                return (
                    <li
                        key={p.slug}
                        className={cn(
                            "min-w-0",
                            lead && "sm:col-span-2 sm:row-span-2",
                        )}
                    >
                        {base !== null ? (
                            <a
                                href={`${base}/${encodeURIComponent(p.slug)}`}
                                className={cn(
                                    card,
                                    "group cursor-pointer rounded-[var(--site-radius)]",
                                    focusRing,
                                )}
                            >
                                {body}
                            </a>
                        ) : (
                            <div className={card}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function LeadCard({
    product: p,
    show,
    lead,
    line,
}: {
    product: ShopListingCard;
    show: LeadShow;
    lead: boolean;
    line: string | null;
}) {
    const amount = formatAmount(p.price, p.currency);
    const eyebrow = optionSummary(p.variantTitles, p.optionName);
    return (
        <>
            {show.photo ? (
                p.image ? (
                    <img
                        src={p.image.url}
                        alt={p.image.alt}
                        loading={lead ? "eager" : "lazy"}
                        className="bg-site-surface aspect-[4/5] w-full rounded-[var(--site-radius)] object-cover"
                    />
                ) : (
                    <span
                        aria-hidden="true"
                        className="bg-site-surface border-site-border block aspect-[4/5] w-full rounded-[var(--site-radius)] border"
                    />
                )
            ) : null}
            <span className="flex items-baseline gap-3">
                <span
                    className={cn(
                        "font-site-heading min-w-0 flex-1 font-semibold leading-tight tracking-[-0.015em] underline-offset-4 group-hover:underline",
                        lead
                            ? "text-[calc(1.5rem*var(--site-heading-scale))]"
                            : "text-[calc(1.1875rem*var(--site-heading-scale))]",
                    )}
                >
                    {p.name}
                </span>
                {show.price ? (
                    <span
                        className={cn(
                            "shrink-0 font-bold tabular-nums",
                            lead ? "text-[22px]" : "text-[18px]",
                            p.soldOut && "text-site-muted",
                        )}
                    >
                        {p.priceFrom ? `From ${amount}` : amount}
                    </span>
                ) : null}
            </span>
            {p.soldOut || eyebrow ? (
                <span className="flex flex-wrap items-center gap-2">
                    {p.soldOut ? (
                        <span className="bg-site-fg text-site-bg rounded-full px-2 py-0.5 text-[11.5px] font-bold">
                            Sold out
                        </span>
                    ) : null}
                    {eyebrow ? (
                        <span className="text-site-muted text-[12px] font-semibold uppercase tracking-[0.08em]">
                            {eyebrow}
                        </span>
                    ) : null}
                </span>
            ) : null}
            {line ? (
                <span className="text-site-body text-[13.5px] leading-normal [text-wrap:pretty]">
                    {line}
                </span>
            ) : null}
            {show.label ? (
                <span className="text-site-accent text-sm font-semibold underline-offset-4 group-hover:underline">
                    {show.label}
                </span>
            ) : null}
        </>
    );
}
