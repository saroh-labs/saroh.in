"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedProductGrid } from "@saroh/block-contract";
import {
    PRODUCT_GRID_DEFAULT_COUNT,
    resolveVariant,
} from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import {
    isShopListingCard,
    productCardsOf,
    productGridQuery,
} from "../lib/product-grid-read";
import { cn, trimTrailingSlashes } from "../lib/utils";
import { optionSummary } from "../product/option-summary";
import { formatAmount } from "../product/product-page";
import type { ShopListingCard } from "../product/shop-listing";
import { cardLink, listCard, listPhoto } from "./list-layout";
import { LeadGrid } from "./product-grid-lead";
import { PlatesGrid } from "./product-grid-plates";

/**
 * `productGrid` v1 — products from the catalogue, read live (G12).
 *
 * The section stores a title, which products (the newest, a collection's or
 * picked by hand), a count and a prices switch. The products come from
 * `GET public/sites/:siteId/shop/products?source=…`, at the storefront the
 * site sells from: only published products listed there, never a draft, and
 * a 404 while the shop isn't open for the business. Two ways in:
 *
 * - **`feed`** — handed in by the page that serves the site, read on the
 *   server. No products (none to show, the shop not open, the read failed):
 *   the block renders NOTHING.
 * - **no feed, a `siteId`** — the editor's canvas. The block reads the same
 *   list itself so the merchant sees their real products, and says why the
 *   section is empty rather than vanishing.
 *
 * With neither (`siteId` undefined) it says where the products come from.
 * `siteId` null is a live render that could not tell, and draws nothing.
 *
 * Follows the Customer Site design's "From the counter" cards: a photo, the
 * options it comes in, the name, a line about it and the price, and "Shop →"
 * beside the title. Drawn from `--site-*` only; gates G2 and G7 fail the
 * build otherwise.
 */

/** The products to show, and where their pages live. */
export interface ProductGridFeed {
    products: ShopListingCard[];
    /**
     * Where product pages live, `/shop`: each card opens
     * `${basePath}/${slug}`, and "Shop →" opens `basePath`. Null draws the
     * cards without links (a preview, which has no shop of its own).
     */
    basePath: string | null;
    /**
     * The grid is on the Shop page itself: no "Shop →" link back to the
     * page the visitor is on (UX-082).
     */
    atShop?: boolean;
}

/** What the section is called when the merchant left the title empty. */
export const PRODUCT_GRID_TITLE = "Our products";

// The read's query and checks live beside the server's use of them
// (lib/product-grid-read).
export { isShopListingCard, productCardsOf, productGridQuery };

/** The storefront's name in a read's body, for the canvas's notes. */
function storefrontOf(body: unknown): string | null {
    const name = (body as { storefront?: { name?: unknown } } | null)
        ?.storefront?.name;
    return typeof name === "string" ? name : null;
}

/** A card's one line: the first sentence of its blurb, as the design cuts it. */
export function cardLine(blurb: string | null): string | null {
    const text = blurb?.trim();
    if (!text) return null;
    const first = /^[^.!?]*[.!?]/.exec(text);
    return first ? first[0] : text;
}

/**
 * What is left, counted from the products shown (template polish): "3 of 5
 * available", "All 5 available", "All sold out". Sold out is said in words,
 * so the line never leans on a colour.
 */
export function availabilityLine(
    products: readonly Pick<ShopListingCard, "soldOut">[],
): string | null {
    const n = products.length;
    if (n === 0) return null;
    const free = products.filter((p) => !p.soldOut).length;
    if (n === 1) return free === 1 ? "Available" : "Sold out";
    if (free === 0) return "All sold out";
    if (free === n) return `All ${n} available`;
    return `${free} of ${n} available`;
}

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; products: ShopListingCard[]; storefront: string | null }
    /** 404: the shop isn't open on this site. */
    | { kind: "off" }
    | { kind: "error" };

export default function ProductGridSection({
    content,
    feed,
    siteId,
    apiUrl = DEFAULT_API_URL,
}: {
    content: RenderedProductGrid;
    /** The products, read by the page that serves the site (live or preview). */
    feed?: ProductGridFeed;
    /**
     * The site, when the block reads its products itself (the editor's
     * canvas). Null: a live render that could not tell, so nothing is drawn.
     * Undefined: no site at all; the block says what will show.
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
}) {
    const query = productGridQuery(content);
    const reads =
        feed === undefined && typeof siteId === "string" && query !== null;
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    const load = useCallback(async (): Promise<LoadState> => {
        if (typeof siteId !== "string" || query === null) {
            return { kind: "error" };
        }
        try {
            const res = await fetch(
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/shop/products?${query}`,
                { headers: { accept: "application/json" } },
            );
            if (res.status === 404) return { kind: "off" };
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            const products = productCardsOf(body);
            return products
                ? { kind: "ready", products, storefront: storefrontOf(body) }
                : { kind: "error" };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, siteId, query]);

    useEffect(() => {
        if (!reads) return;
        // A new choice in the editor reads again; the old cards stay until
        // the new ones arrive.
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [reads, load]);

    const title = said(content.title) ?? PRODUCT_GRID_TITLE;

    if (feed) {
        return <ProductCards content={content} title={title} feed={feed} />;
    }
    if (siteId === null) return null;
    if (siteId === undefined) {
        return (
            <GridNote title={title}>
                Products from your catalogue show here on your live site, with
                their photo and price.
            </GridNote>
        );
    }
    if (query === null) {
        return (
            <GridNote title={title}>
                {content.source === "collection"
                    ? "Choose a collection and its products show here. Until then this section is left off your live site."
                    : "Pick the products to show and they appear here. Until then this section is left off your live site."}
            </GridNote>
        );
    }
    if (state.kind === "loading") {
        return (
            <GridNote title={title} busy>
                Loading your products…
            </GridNote>
        );
    }
    if (state.kind === "error") {
        return (
            <GridNote
                title={title}
                action={
                    <button
                        type="button"
                        onClick={() => {
                            setState({ kind: "loading" });
                            void load().then(setState);
                        }}
                        className={textButton}
                    >
                        Try again
                    </button>
                }
            >
                We couldn&apos;t load your products just now.
            </GridNote>
        );
    }
    if (state.kind === "off") {
        return (
            <GridNote title={title}>
                Your site doesn&apos;t sell from a storefront yet, or Commerce
                is off, so this section is left off your live site. Choose where
                it sells from in the site&apos;s settings.
            </GridNote>
        );
    }
    if (state.products.length === 0) {
        const where = state.storefront ?? "your storefront";
        return (
            <GridNote title={title}>
                {content.source === "picked"
                    ? `None of the products picked here is on sale at ${where}, so this section is left off your live site.`
                    : content.source === "collection"
                      ? `Nothing in this collection is on sale at ${where}, so this section is left off your live site.`
                      : `Nothing is on sale at ${where} yet, so this section is left off your live site.`}
            </GridNote>
        );
    }
    return (
        <ProductCards
            content={content}
            title={title}
            // The canvas draws the cards; clicking one selects the block.
            feed={{ products: state.products, basePath: null }}
        />
    );
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent underline-offset-4 transition-opacity hover:underline active:opacity-70",
    focusRing,
);

function GridFrame({
    title,
    more,
    count = null,
    note = null,
    children,
}: {
    title: string;
    more?: React.ReactNode;
    /** What is left, beside the title (template polish). */
    count?: string | null;
    /** The merchant's line under the grid (template polish). */
    note?: string | null;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div
                className={cn(
                    "mb-3.5 flex items-baseline gap-3",
                    count && "flex-wrap",
                )}
            >
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg min-w-0 flex-1 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                >
                    {title}
                </h2>
                {count ? (
                    <span
                        data-availability=""
                        className="text-site-muted shrink-0 text-[12.5px] font-semibold uppercase tracking-[0.09em]"
                    >
                        {count}
                    </span>
                ) : null}
                {more ?? null}
            </div>
            {children}
            {note ? (
                <p className="text-site-body mt-6 max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed">
                    {note}
                </p>
            ) : null}
        </section>
    );
}

/** Said where there is nothing to list: the canvas, never the live site. */
function GridNote({
    title,
    busy = false,
    action,
    children,
}: {
    title: string;
    busy?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <GridFrame title={title}>
            <div
                role={action ? "alert" : "status"}
                aria-busy={busy || undefined}
                className="border-site-border text-site-body grid justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
            >
                <p>{children}</p>
                {action ?? null}
            </div>
        </GridFrame>
    );
}

const cardClass =
    "border-site-border bg-site-surface text-site-fg grid h-full min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border pb-4";

function ProductCards({
    content,
    title,
    feed,
}: {
    content: RenderedProductGrid;
    title: string;
    feed: ProductGridFeed;
}) {
    const products = feed.products.slice(
        0,
        content.count ?? PRODUCT_GRID_DEFAULT_COUNT,
    );
    if (products.length === 0) return null;
    // Display options (G16). Absent: cards with their photos, lines and
    // prices, and no button (the card itself opens the product).
    const show: CardShow = {
        price: content.showPrices !== false,
        photo: content.showPhotos !== false,
        line: content.showDescriptions !== false,
        label: said(content.buttonLabel),
    };
    const list = content.layout === "list";
    const base =
        feed.basePath != null ? trimTrailingSlashes(feed.basePath) : null;
    // The lead look (U2): the first product twice the room. It ignores
    // "Show as", which is the even grid's.
    const look = resolveVariant("productGrid", content);
    const lead = look === "lead";
    // The plates look (DEC-090): photos in fixed cells, words on a band.
    const plates = look === "plates";
    const card = (p: ShopListingCard) =>
        list
            ? listCard(show.photo && p.image !== null)
            : cn(cardClass, !show.photo && "pt-4");
    // Bare cards (template polish): the even grid without the card.
    const bare = !lead && !plates && !list && content.cardStyle === "bare";

    return (
        <GridFrame
            title={title}
            count={content.showAvailability ? availabilityLine(products) : null}
            note={said(content.note)}
            more={
                feed.atShop ? null : base !== null ? (
                    <a
                        href={base || "/"}
                        className={cn(textButton, "shrink-0")}
                    >
                        Shop <span aria-hidden="true">→</span>
                    </a>
                ) : (
                    <span className="text-site-accent shrink-0 text-sm font-semibold">
                        Shop <span aria-hidden="true">→</span>
                    </span>
                )
            }
        >
            {plates ? (
                <PlatesGrid
                    products={products}
                    show={show}
                    base={base}
                    line={cardLine}
                />
            ) : lead ? (
                <LeadGrid
                    products={products}
                    show={show}
                    base={base}
                    line={cardLine}
                />
            ) : bare ? (
                <BareGrid
                    products={products}
                    show={show}
                    base={base}
                    columns={content.columns}
                />
            ) : (
                <ul
                    className={cn(
                        "grid",
                        list
                            ? "grid-cols-1 gap-2.5"
                            : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]",
                    )}
                >
                    {products.map((p) => {
                        const inner = list ? (
                            <ListRowBody product={p} show={show} />
                        ) : (
                            <CardBody product={p} show={show} />
                        );
                        return (
                            <li key={p.slug} className="min-w-0">
                                {base !== null ? (
                                    <a
                                        href={`${base}/${encodeURIComponent(p.slug)}`}
                                        className={cn(
                                            card(p),
                                            "hover:border-site-fg/40 group cursor-pointer transition-[border-color,transform] active:scale-[0.99]",
                                            focusRing,
                                        )}
                                    >
                                        {inner}
                                    </a>
                                ) : (
                                    <div className={card(p)}>{inner}</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </GridFrame>
    );
}

/** What each card shows (G16's display options, resolved). */
interface CardShow {
    price: boolean;
    photo: boolean;
    line: boolean;
    /** The merchant's words at the card's foot; null draws none. */
    label: string | null;
}

/** "Show as: List" (G16): the photo on the left, the words beside it. */
function ListRowBody({
    product: p,
    show,
}: {
    product: ShopListingCard;
    show: CardShow;
}) {
    return (
        <>
            {show.photo && p.image ? (
                <img
                    src={p.image.url}
                    alt={p.image.alt}
                    loading="lazy"
                    className={listPhoto}
                />
            ) : null}
            <span className="grid min-w-0 content-start gap-1.5 py-4">
                <CardWords product={p} show={show} />
            </span>
        </>
    );
}

function CardBody({
    product: p,
    show,
}: {
    product: ShopListingCard;
    show: CardShow;
}) {
    return (
        <>
            {!show.photo ? null : p.image ? (
                // Remote images from the merchant's media, a plain <img> as
                // every block's: next/image would need each origin allowlisted.
                <img
                    src={p.image.url}
                    alt={p.image.alt}
                    loading="lazy"
                    className="mb-1.5 h-[130px] w-full object-cover"
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="bg-site-bg mb-1.5 block h-[130px]"
                />
            )}
            <CardWords product={p} show={show} />
        </>
    );
}

/** A card's words: its options, name, line, price and the merchant's button. */
function CardWords({
    product: p,
    show,
}: {
    product: ShopListingCard;
    show: CardShow;
}) {
    const line = show.line ? cardLine(p.blurb) : null;
    const eyebrow = optionSummary(p.variantTitles, p.optionName);
    const amount = formatAmount(p.price, p.currency);
    return (
        <>
            {eyebrow || p.soldOut ? (
                <span className="flex items-center gap-2 px-4">
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
            <span className="font-site-heading px-4 text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] underline-offset-4 group-hover:underline">
                {p.name}
            </span>
            {line ? (
                <span className="text-site-body px-4 text-[13.5px] leading-normal [text-wrap:pretty]">
                    {line}
                </span>
            ) : null}
            {show.price ? (
                <span
                    className={cn(
                        "mt-1 px-4 text-[15px] font-bold tabular-nums",
                        p.soldOut && "text-site-muted",
                    )}
                >
                    {p.priceFrom ? `From ${amount}` : amount}
                </span>
            ) : null}
            {show.label ? <span className={cardLink}>{show.label}</span> : null}
        </>
    );
}

/**
 * A set number across for the bare cards (template round 2), at the desk:
 * five breads in a row. It steps down so a card never gets narrower than
 * its name and price beside each other — three on a tablet, two on a
 * phone, one on the narrowest — with the gap tightened on a phone. Whole
 * class names, so Tailwind finds them. A count this build does not know
 * fills the row as before.
 */
const BARE_COLUMNS: Partial<Record<number, string>> = {
    3: "grid-cols-1 gap-x-4 min-[360px]:grid-cols-2 sm:gap-x-[30px] md:grid-cols-3",
    4: "grid-cols-1 gap-x-4 min-[360px]:grid-cols-2 sm:gap-x-[30px] md:grid-cols-3 lg:grid-cols-4",
    5: "grid-cols-1 gap-x-4 min-[360px]:grid-cols-2 sm:gap-x-[30px] md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
};

/**
 * The bare cards (template polish), as the bakery design lays out its
 * bread: no card around each product, a tall 4:5 photo, the name and the
 * price side by side in the heading face, the line under them. Sold out is
 * a label on the photo's top corner and the words go quiet — said, not only
 * coloured. With photos off, the label sits beside the name.
 */
function BareGrid({
    products,
    show,
    base,
    columns,
}: {
    products: ShopListingCard[];
    show: CardShow;
    base: string | null;
    columns?: number;
}) {
    const fixed = columns !== undefined ? BARE_COLUMNS[columns] : undefined;
    return (
        <ul
            className={cn(
                "grid gap-y-10",
                fixed ??
                    "gap-x-[30px] [grid-template-columns:repeat(auto-fill,minmax(min(212px,100%),1fr))]",
            )}
        >
            {products.map((p) => {
                const line = show.line ? cardLine(p.blurb) : null;
                const amount = formatAmount(p.price, p.currency);
                const soldOut = p.soldOut ? (
                    <span className="bg-site-fg text-site-bg px-2 py-1 text-[11.5px] font-semibold uppercase tracking-[0.06em]">
                        Sold out
                    </span>
                ) : null;
                const inner = (
                    <>
                        {show.photo ? (
                            <span className="bg-site-surface relative mb-3.5 block aspect-[4/5] overflow-hidden rounded-[var(--site-radius)]">
                                {p.image ? (
                                    <img
                                        src={p.image.url}
                                        alt={p.image.alt}
                                        loading="lazy"
                                        className="h-full w-full object-cover"
                                    />
                                ) : null}
                                {soldOut ? (
                                    <span className="absolute left-0 top-0 flex">
                                        {soldOut}
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                        <span className="flex items-baseline gap-3">
                            <span
                                className={cn(
                                    "font-site-heading min-w-0 flex-1 text-[calc(1.25rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em] underline-offset-4 group-hover:underline",
                                    p.soldOut && "text-site-muted",
                                )}
                            >
                                {p.name}
                            </span>
                            {!show.photo && soldOut ? (
                                <span className="shrink-0">{soldOut}</span>
                            ) : null}
                            {show.price ? (
                                <span
                                    className={cn(
                                        "font-site-heading shrink-0 text-[calc(1.3125rem*var(--site-heading-scale))] font-semibold tabular-nums tracking-[-0.02em]",
                                        p.soldOut && "text-site-muted",
                                    )}
                                >
                                    {p.priceFrom ? `From ${amount}` : amount}
                                </span>
                            ) : null}
                        </span>
                        {line ? (
                            <span className="text-site-body mt-1.5 block text-[14px] leading-normal [text-wrap:pretty]">
                                {line}
                            </span>
                        ) : null}
                        {show.label ? (
                            <span className="text-site-accent mt-2 block text-sm font-semibold underline-offset-4 group-hover:underline">
                                {show.label}
                            </span>
                        ) : null}
                    </>
                );
                return (
                    <li key={p.slug} className="text-site-fg min-w-0">
                        {base !== null ? (
                            <a
                                href={`${base}/${encodeURIComponent(p.slug)}`}
                                className={cn(
                                    "group block cursor-pointer rounded-[var(--site-radius)]",
                                    focusRing,
                                )}
                            >
                                {inner}
                            </a>
                        ) : (
                            <div>{inner}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
