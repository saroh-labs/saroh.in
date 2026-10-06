import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";
import type { ShopListingCard } from "../product/shop-listing";
import type { LeadShow } from "./product-grid-lead";

/**
 * The Product grid's `plates` look (DEC-090; the ceramics design's bento):
 * every product a photo in a fixed-height cell, hairlines between them (the
 * grid gap shows the page's border colour, so a template's 1px gap reads as
 * a rule), and the first product twice the room. The name, a line and a
 * small price sit on a band OVER the photo.
 *
 * The band is bounded — a fixed height with its lines clipped, each line one
 * line long with an ellipsis — so a long name never climbs the photo
 * ("captions are bounded", the templates' rule). Its words are the page
 * colour on a scrim of the text colour, so they hold the palette's own
 * text-on-page contrast in reverse whatever the photo is.
 *
 * Sold out is a word on the band and in the link's name, never a faded
 * photo or a colour alone. Drawn from `--site-*` only (gate G2).
 */

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export function PlatesGrid({
    products,
    show,
    base,
    line,
}: {
    products: ShopListingCard[];
    show: LeadShow;
    /** Where product pages live; null draws the cells without links. */
    base: string | null;
    /** The cell's line from a product's blurb (the grid's own rule). */
    line: (blurb: string | null) => string | null;
}) {
    return (
        <ul
            data-grid-look="plates"
            className="bg-site-border grid auto-rows-[210px] grid-cols-2 gap-[var(--site-grid-gap)] md:auto-rows-[214px] md:[grid-template-columns:1.7fr_1fr_1fr]"
        >
            {products.map((p, i) => {
                const lead = i === 0;
                const body = (
                    <Plate
                        product={p}
                        show={show}
                        lead={lead}
                        line={show.line ? line(p.blurb) : null}
                    />
                );
                const cell =
                    "bg-site-surface relative block h-full min-w-0 overflow-hidden";
                return (
                    <li
                        key={p.slug}
                        className={cn(
                            "min-w-0",
                            lead && "col-span-2 md:col-span-1 md:row-span-2",
                        )}
                    >
                        {base !== null ? (
                            <a
                                href={`${base}/${encodeURIComponent(p.slug)}`}
                                className={cn(
                                    cell,
                                    "group cursor-pointer",
                                    focusRing,
                                )}
                            >
                                {body}
                            </a>
                        ) : (
                            <div className={cell}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function Plate({
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
    return (
        <>
            {show.photo && p.image ? (
                <img
                    src={p.image.url}
                    alt={p.image.alt}
                    loading={lead ? "eager" : "lazy"}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            ) : null}
            <span
                data-plate-band=""
                className={cn(
                    "from-site-fg/90 via-site-fg/85 to-site-fg/0 text-site-bg absolute inset-x-0 bottom-0 flex flex-col justify-end gap-0.5 overflow-hidden bg-gradient-to-t px-3.5 pb-3 pt-6",
                    lead ? "h-[124px]" : "h-[96px]",
                )}
            >
                <span
                    className={cn(
                        "font-site-heading block truncate leading-tight underline-offset-4 group-hover:underline",
                        lead
                            ? "text-[calc(1.625rem*var(--site-heading-scale))]"
                            : "text-[calc(0.96875rem*var(--site-heading-scale))]",
                    )}
                >
                    {p.name}
                </span>
                {line ? (
                    <span
                        className={cn(
                            "block truncate",
                            lead ? "text-[13px]" : "text-[11.5px]",
                        )}
                    >
                        {line}
                    </span>
                ) : null}
                {show.price || p.soldOut ? (
                    <span className="flex min-w-0 items-center gap-2">
                        {show.price ? (
                            <span
                                className={cn(
                                    "truncate tabular-nums",
                                    lead ? "text-[14.5px]" : "text-[12.5px]",
                                )}
                            >
                                {p.priceFrom ? `From ${amount}` : amount}
                            </span>
                        ) : null}
                        {p.soldOut ? (
                            <span className="shrink-0 rounded-[2px] border border-current px-1.5 text-[11px] uppercase leading-[1.5] tracking-[0.06em]">
                                Sold out
                            </span>
                        ) : null}
                    </span>
                ) : null}
                {show.label ? (
                    <span className="block truncate text-[12.5px] font-semibold underline underline-offset-4">
                        {show.label}
                    </span>
                ) : null}
            </span>
        </>
    );
}
