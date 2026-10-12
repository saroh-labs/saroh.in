"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import { focusRing } from "../booking-flow/styles";
import type { GstOnPrice } from "../lib/gst-price";
import {
    gstNoteWords,
    gstOnPriceOf,
    gstPayWords,
    gstPriceWords,
    startOfLine,
} from "../lib/gst-price";
import { formatAmount } from "../lib/money";
import type { MrpSaving } from "../lib/mrp-saving";
import { percentOff, shownSaving } from "../lib/mrp-saving";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { plateTint } from "./name-plate";

/**
 * A product as a shop page shows it (products v2, #465).
 *
 * ONE component for two places: the workspace's Customer view previews a
 * product with it today, and the public storefront's product page will render
 * with it when that page exists (#473) — so what a merchant previews is what a
 * customer gets. It draws from `--site-*` only, never Saroh's brand, and takes
 * everything as props: no fetching, no API shapes.
 *
 * Picking a variant changes the price, the MRP and saving, the stock word and
 * the photo — the way a customer tries sizes. In `preview` mode the bag
 * button is shown but does nothing, and says so.
 *
 * Public mode (`preview={false}`, round-2 G11) is the merchant's live
 * product page: no markers and no staff controls, and where the basket
 * button sits, an `action` slot, which the bag and checkout (G13) fill
 * with Add to bag, or "Ask about ordering" where the site can't take an
 * online order. Whatever fills it reads the chosen variant, and whether it
 * is sold out, with
 * {@link useProductSelection}, so a server page can pass it as a plain node.
 *
 * `markers` draws numbered badges on each area so a panel beside the preview
 * can explain them (1 photos, 2 price, 3 variants and stock, 4 description and
 * details, 5 how to use, 6 reviews, 7 made by and returns).
 *
 * **With no photo** (starter audit, 12 Oct 2026) the page draws no empty
 * frame, and never says "No photo yet" to a customer. The name leads at
 * display size under a short rule in the accent, with the price and the way
 * to buy; what it is and its details take the second column. Only the
 * workspace's staff notes keep the words, beside note 1.
 */

export type StockWord = "IN_STOCK" | "LOW" | "SOLD_OUT" | "UNTRACKED";

export interface ProductPageImage {
    id: string;
    url: string;
    alt: string;
    width?: number | null;
    height?: number | null;
    /** "video" for an MP4 or MOV (#517); a photo otherwise. */
    kind?: "photo" | "video";
    /** A video's length in seconds, for its badge. */
    durationSec?: number | null;
    /** A video's poster; shown before it plays and when it can't. */
    posterUrl?: string | null;
}

/** A video's length as its badge shows it: "0:24". */
export function videoLength(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export interface ProductPageVariant {
    id: string;
    title: string;
    /** Null = the product's price. */
    price: string | null;
    /**
     * The GST in or on the price this option sells at (its own, else the
     * product's); null for none. Absent from an older API.
     */
    gst?: GstOnPrice | null;
    mrp: string | null;
    /**
     * The saving against the MRP at what is paid for this option, worked
     * out by the API; null for none. Absent from an older API, and from a
     * preview: `shownSaving` then compares with what the page holds.
     */
    saving?: MrpSaving | null;
    /** The photo shown when picked; null = the cover. */
    imageId: string | null;
    stock: StockWord;
    /** How many can be sold, for "Only 2 left". */
    left: number | null;
}

export interface ProductPageReview {
    id: string;
    rating: number;
    body: string | null;
    displayName: string;
    variantTitle: string | null;
    reply: string | null;
    dateLabel: string;
}

export interface ProductPageData {
    name: string;
    currency: string;
    price: string;
    /**
     * The GST in or on that price, worked out by the API; null when there
     * is none to say (not registered, exempt, no rate). Absent from an
     * older API: none.
     */
    gst?: GstOnPrice | null;
    mrp: string | null;
    /**
     * The saving against the MRP at what is paid for it, GST and all,
     * worked out by the API; null for none. Absent from an older API.
     */
    saving?: MrpSaving | null;
    categoryName: string | null;
    /** Sanitised HTML — the API's allowlist runs on every save. */
    description: string | null;
    keyPoints: string[];
    /** Each is null when empty OR switched to team only. */
    howToUse: string | null;
    materials: string | null;
    materialsLabel?: string;
    maker: string | null;
    warranty: string | null;
    returns: string | null;
    /** The merchant's own fields switched on for the shop (#482), filled. */
    extras?: { label: string; value: string }[];
    images: ProductPageImage[];
    optionName: string | null;
    variants: ProductPageVariant[];
    /** A product without variants: its own stock. */
    stock: { word: StockWord; left: number | null } | null;
    rating: { average: number; count: number } | null;
    reviews: ProductPageReview[];
}

// Lives in `lib/money` (no directive) so a server page can call it too: an
// export of this "use client" module is only a client reference there.
export { formatAmount, percentOff };

/**
 * The saving the page shows for what is picked: the API's, which compares
 * the MRP with the amount to pay, GST and all (`lib/mrp-saving.ts`). Where
 * the API sent none of its own (an older one, or the workspace's preview),
 * the MRP is the option's own, else the product's, beside the amount to
 * pay the page already holds: the typed price, or the API's `payCents`
 * where GST is added. Null: nothing is struck through, no "% off".
 */
export function productSaving(
    product: Pick<ProductPageData, "price" | "mrp" | "gst" | "saving">,
    variant: Pick<
        ProductPageVariant,
        "price" | "mrp" | "gst" | "saving"
    > | null,
): MrpSaving | null {
    const gst = productGst(product, variant);
    return shownSaving(
        variant ? variant.saving : product.saving,
        gst?.mode === "ADDED"
            ? (gst.payCents / 100).toFixed(2)
            : (variant?.price ?? product.price),
        variant?.mrp ?? product.mrp,
    );
}

export function stockLabel(
    word: StockWord,
    left: number | null,
): string | null {
    if (word === "SOLD_OUT") return "Sold out";
    if (word === "LOW")
        return left !== null ? `Only ${left} left` : "Only a few left";
    if (word === "IN_STOCK") return "In stock";
    return null;
}

/**
 * The GST words under the price, following the option picked: its own
 * where the API sent one, else the product's when the option sells at the
 * product's price. Null: nothing is said about GST.
 */
export function productGst(
    product: Pick<ProductPageData, "gst">,
    variant: Pick<ProductPageVariant, "gst" | "price"> | null,
): GstOnPrice | null {
    if (!variant) return gstOnPriceOf(product.gst);
    if (variant.gst !== undefined) return gstOnPriceOf(variant.gst);
    return variant.price === null ? gstOnPriceOf(product.gst) : null;
}

/** What the visitor has chosen, for whatever fills the action slot. */
export interface ProductSelection {
    /** The variant picked; null for a product without variants. */
    variantId: string | null;
    /** Its title ("Large"), for words about it; null without variants. */
    variantTitle: string | null;
    /** The product's name. */
    name: string;
    /** The price shown for it. */
    price: string;
    /** GST comes on top of that price: the action says "+ GST" after it. */
    gstAdded?: boolean;
    /**
     * What one of it costs to pay, GST and all, when the page knows the
     * sum: the action names this instead of "price + GST".
     */
    payAmount?: string;
    /** The currency that price is in. */
    currency?: string;
    /** Nothing of it can be sold now: the action is off. */
    soldOut: boolean;
    /**
     * How many can be sold, when the page says so ("Only 2 left"); null
     * otherwise. The bag never offers more than this (UX-058).
     */
    left?: number | null;
}

const SelectionContext = createContext<ProductSelection | null>(null);

/**
 * The chosen variant, inside a public product page's action slot. Null
 * outside one.
 */
export function useProductSelection(): ProductSelection | null {
    return useContext(SelectionContext);
}

function Marker({ n, show }: { n: number; show: boolean }) {
    if (!show) return null;
    return (
        <span
            aria-label={`Note ${n}`}
            className="bg-site-accent text-site-accent-fg inline-grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold leading-none"
        >
            {n}
        </span>
    );
}

/** The play mark and length on a video's thumbnail. */
function VideoBadge({ length }: { length: string }) {
    return (
        <span
            aria-hidden
            className="bg-site-fg text-site-bg absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
        >
            <svg viewBox="0 0 10 10" className="size-2 fill-current">
                <path d="M2 1l7 4-7 4z" />
            </svg>
            {length || "Video"}
        </span>
    );
}

/**
 * A product video (#517): played as uploaded — MP4 or MOV, no transcoding —
 * with its poster until it plays. A browser that can't play the file (a MOV
 * outside Safari, often) falls back to the poster with a link to open the
 * video itself, rather than an empty black box.
 */
function ProductVideo({
    video,
    name,
}: {
    video: ProductPageImage;
    name: string;
}) {
    const [failed, setFailed] = useState(false);
    const label = video.alt || `A video of ${name}`;
    if (failed) {
        return (
            <div className="relative">
                {video.posterUrl ? (
                    <img
                        src={video.posterUrl}
                        alt={label}
                        {...siteImage("above")}
                        className="aspect-[4/5] w-full object-cover"
                    />
                ) : (
                    <div className="aspect-[4/5] w-full" aria-hidden />
                )}
                <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-site-fg text-site-bg absolute bottom-3 left-3 rounded-[var(--site-radius,2px)] px-3 py-2 text-sm font-medium"
                >
                    Open video
                </a>
            </div>
        );
    }
    return (
        <video
            src={video.url}
            poster={video.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            aria-label={label}
            onError={() => setFailed(true)}
            className="bg-site-surface aspect-[4/5] w-full object-cover"
        />
    );
}

function Stars({ rating, className }: { rating: number; className?: string }) {
    const full = Math.round(rating);
    return (
        <span
            role="img"
            aria-label={`${rating} out of 5`}
            className={cn("text-site-fg tracking-[0.08em]", className)}
        >
            {"★".repeat(full)}
            <span className="text-site-border">{"★".repeat(5 - full)}</span>
        </span>
    );
}

/** A section's title on the product page: the heading face, one size. */
const sectionTitle =
    "font-site-heading flex items-center gap-2 text-[calc(1.0625rem*var(--site-heading-scale,1))] font-semibold tracking-[-0.01em]";

export default function ProductPage({
    product,
    markers: markersAsked = false,
    preview = true,
    locale = "en-IN",
    action,
    facts = null,
    back = null,
}: {
    product: ProductPageData;
    /** Staff notes' numbered badges: the workspace preview only. */
    markers?: boolean;
    /** The workspace preview (default); false is the live product page. */
    preview?: boolean;
    locale?: string;
    /** The live page's action (G13 fills it); ignored in preview. */
    action?: ReactNode;
    /**
     * What an order costs to receive, under the price: "Pick-up free ·
     * Local delivery ₹60" (`shopFactsLine`, from the location's checkout).
     * Null says nothing: a shop that isn't taking orders, or the preview.
     */
    facts?: string | null;
    /**
     * The way back to the shop, over the product on its live page: where it
     * leads and what the shop is called on this site ("Shop", or the Shop
     * page's own name). Null, and in the preview, draws none.
     */
    back?: { href: string; label: string } | null;
}) {
    // The live page never draws staff notes, whatever it is handed.
    const markers = preview && markersAsked;
    const firstAvailable =
        product.variants.find((v) => v.stock !== "SOLD_OUT") ??
        product.variants.at(0);
    const [variantId, setVariantId] = useState<string | null>(
        firstAvailable?.id ?? null,
    );
    const [imageIndex, setImageIndex] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);

    const variant = product.variants.find((v) => v.id === variantId) ?? null;
    const price = variant?.price ?? product.price;
    // The MRP beside the amount to pay, GST and all: none when that is
    // the MRP or more.
    const saving = productSaving(product, variant);
    const gst = productGst(product, variant);
    // GST comes on top and an MRP is shown: lead with what is paid.
    const leadsWithPay = saving !== null && gst?.mode === "ADDED";
    const stock = variant
        ? { word: variant.stock, left: variant.left }
        : product.stock;
    const soldOut = stock?.word === "SOLD_OUT";
    const shown = product.images.at(imageIndex) ?? product.images.at(0);

    function pick(next: ProductPageVariant) {
        setVariantId(next.id);
        setNotice(null);
        if (next.imageId) {
            const i = product.images.findIndex(
                (img) => img.id === next.imageId,
            );
            if (i >= 0) setImageIndex(i);
        } else {
            setImageIndex(0);
        }
    }

    function addToBag() {
        if (soldOut) return;
        setNotice("This is a preview. Nothing is added to a bag.");
    }

    // The rating, only while there are reviews to show under it.
    const reviewed = product.reviews.length > 0 ? product.rating : null;
    const hasReviews = reviewed !== null;

    const details: { label: string; value: string }[] = [
        ...(product.materials
            ? [
                  {
                      label: product.materialsLabel ?? "Ingredients",
                      value: product.materials,
                  },
              ]
            : []),
        ...(product.maker ? [{ label: "Made by", value: product.maker }] : []),
        ...(product.warranty
            ? [{ label: "Warranty", value: product.warranty }]
            : []),
        ...(product.returns
            ? [{ label: "Returns", value: product.returns }]
            : []),
        ...(product.extras ?? []),
    ];

    const hasPhotos = product.images.length > 0;
    const hasAbout =
        Boolean(product.description) || product.keyPoints.length > 0;

    // What it is, what it costs and the way to buy it: beside the photos,
    // or leading the page when there are none.
    const buy = (
        <div className="min-w-0">
            {product.categoryName ? (
                <p className="text-site-muted text-xs font-semibold uppercase tracking-[0.12em]">
                    {product.categoryName}
                </p>
            ) : null}
            <h1
                className={cn(
                    "font-site-heading text-site-fg mt-1.5 font-semibold leading-[1.08] tracking-[-0.025em] [overflow-wrap:anywhere] [text-wrap:balance]",
                    // With no photo the name is the page's picture.
                    hasPhotos
                        ? "text-[calc(clamp(1.625rem,4.2vw,2.25rem)*var(--site-heading-scale,1))]"
                        : "text-[calc(clamp(1.875rem,5.4vw,2.875rem)*var(--site-heading-scale,1))]",
                )}
            >
                {product.name}
            </h1>
            {product.rating ? (
                <p className="text-site-body mt-2.5 flex items-center gap-2 text-sm">
                    <Stars rating={product.rating.average} />
                    <span>
                        {product.rating.average.toFixed(1)} ·{" "}
                        {product.rating.count}{" "}
                        {product.rating.count === 1 ? "review" : "reviews"}
                    </span>
                </p>
            ) : null}

            {/* 2 — price */}
            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Marker n={2} show={markers} />
                {/* Beside a struck-through MRP the big figure is what is
                    paid, GST and all: an MRP includes its taxes, so "7%
                    off" next to the price before GST would read as a
                    saving against the wrong number. */}
                <span
                    data-price-lead=""
                    className="font-site-heading text-[calc(1.75rem*var(--site-heading-scale,1))] font-semibold tabular-nums leading-none tracking-[-0.02em]"
                >
                    {leadsWithPay
                        ? gstPayWords(gst, product.currency, locale)
                        : formatAmount(price, product.currency, locale)}
                </span>
                {saving ? (
                    <>
                        <span
                            data-price-mrp=""
                            className="text-site-muted text-[15px] tabular-nums line-through"
                        >
                            <span className="sr-only">MRP </span>
                            {formatAmount(saving.mrp, product.currency, locale)}
                        </span>
                        {/* Under one whole percent there is no number to
                            say: the MRP alone shows the saving. */}
                        {saving.percent > 0 ? (
                            <span
                                data-price-off=""
                                className={cn(
                                    "text-site-fg rounded-full px-2 py-0.5 text-[12.5px] font-semibold",
                                    plateTint,
                                )}
                            >
                                {saving.percent}% off
                            </span>
                        ) : null}
                    </>
                ) : null}
            </div>
            {/* What the price carries in tax, under every price, MRP or
                not: the GST the API worked out, in the words the bag and
                checkout use, with the amount to pay when it is added on
                top. With no GST to say, the price includes its taxes. */}
            {gst ? (
                <p
                    data-price-gst=""
                    className="text-site-body mt-2 text-sm tabular-nums"
                >
                    {leadsWithPay
                        ? gstPriceWords(gst, product.currency, locale)
                        : startOfLine(
                              gstNoteWords(gst, product.currency, locale),
                          )}
                    {gst.mode === "ADDED" && !leadsWithPay ? (
                        <>
                            {" · "}
                            <span className="text-site-fg whitespace-nowrap font-semibold">
                                {gstPayWords(gst, product.currency, locale)} to
                                pay
                            </span>
                        </>
                    ) : null}
                </p>
            ) : (
                <p className="text-site-body mt-2 text-sm">
                    Inclusive of all taxes
                </p>
            )}
            {facts ? (
                <p className="text-site-body mt-1 text-sm [overflow-wrap:anywhere]">
                    {facts}
                </p>
            ) : null}

            {/* 5 — how to use / care, one line under the price */}
            {product.howToUse ? (
                <p className="text-site-body mt-3 flex items-start gap-2 text-sm leading-relaxed">
                    <Marker n={5} show={markers} />
                    <span>{product.howToUse}</span>
                </p>
            ) : null}

            {/* 3 — variants and stock */}
            {product.variants.length > 0 ? (
                <fieldset className="mt-6">
                    <legend className="flex items-center gap-2 text-sm font-semibold">
                        <Marker n={3} show={markers} />
                        {/* One run of text, so the gap between the
                            marker and the name never opens up
                            before the colon ("Size: Small"). */}
                        <span>
                            {product.optionName ?? "Choose"}
                            {variant ? (
                                <span className="text-site-body font-normal">
                                    : {variant.title}
                                </span>
                            ) : null}
                        </span>
                    </legend>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                        {product.variants.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => pick(v)}
                                aria-pressed={v.id === variantId}
                                className={cn(
                                    "min-h-11 min-w-11 max-w-full cursor-pointer rounded-[calc(var(--site-radius,2px)+6px)] border px-3.5 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] duration-100 ease-out [overflow-wrap:anywhere] active:scale-[0.97]",
                                    focusRing,
                                    v.id === variantId
                                        ? "border-site-fg bg-site-fg text-site-bg"
                                        : "border-site-border bg-site-surface text-site-fg hover:border-site-fg",
                                    // Sold out is struck through, and said
                                    // to a screen reader; picked, it keeps
                                    // the picked colours so it still reads.
                                    v.stock === "SOLD_OUT" &&
                                        "line-through decoration-1",
                                    v.stock === "SOLD_OUT" &&
                                        v.id !== variantId &&
                                        "text-site-muted decoration-site-muted border-dashed",
                                )}
                            >
                                {v.title}
                                {v.stock === "SOLD_OUT" ? (
                                    <span className="sr-only"> (sold out)</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </fieldset>
            ) : null}

            {stock && stockLabel(stock.word, stock.left) ? (
                <p
                    className={cn(
                        "mt-3 flex items-center gap-2 text-sm",
                        stock.word === "IN_STOCK"
                            ? "text-site-body"
                            : "text-site-fg font-semibold",
                    )}
                >
                    {product.variants.length === 0 ? (
                        <Marker n={3} show={markers} />
                    ) : null}
                    {stockLabel(stock.word, stock.left)}
                </p>
            ) : null}

            {preview ? (
                <>
                    <button
                        type="button"
                        onClick={addToBag}
                        disabled={soldOut}
                        className="bg-site-accent text-site-accent-fg mt-5 min-h-11 w-full rounded-[var(--site-radius,2px)] px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                        {soldOut ? "Sold out" : "Add to bag"}
                    </button>
                    {notice ? (
                        <p
                            role="status"
                            className="text-site-muted mt-2 text-xs"
                        >
                            {notice}
                        </p>
                    ) : null}
                </>
            ) : action ? (
                <SelectionContext.Provider
                    value={{
                        variantId: variant?.id ?? null,
                        variantTitle: variant?.title ?? null,
                        name: product.name,
                        price,
                        gstAdded: gst?.mode === "ADDED",
                        payAmount:
                            gst?.mode === "ADDED"
                                ? (gst.payCents / 100).toFixed(2)
                                : undefined,
                        currency: product.currency,
                        soldOut,
                        left:
                            stock?.word === "LOW" ? (stock.left ?? null) : null,
                    }}
                >
                    <div className="mt-6">{action}</div>
                </SelectionContext.Provider>
            ) : null}
        </div>
    );

    // What it is in words, and its facts: under the buying column beside
    // the photos, or in a column of its own when there are none.
    const about =
        hasAbout || details.length > 0 ? (
            <div
                className={cn(
                    "min-w-0",
                    // With no photo this is a column of its own at a desk;
                    // on a phone it follows the button, under a rule.
                    !hasPhotos &&
                        "max-md:border-site-border max-md:border-t max-md:pt-6",
                )}
            >
                {/* 4 — description and details */}
                {hasAbout ? (
                    <section
                        className={cn(
                            hasPhotos &&
                                "border-site-border mt-7 border-t pt-6",
                        )}
                    >
                        <h2 className={sectionTitle}>
                            <Marker n={4} show={markers} />
                            About this product
                        </h2>
                        {product.description ? (
                            <div
                                className="prose prose-sm prose-headings:text-site-fg prose-p:text-site-body prose-strong:text-site-fg prose-li:text-site-body prose-a:text-site-accent mt-2.5 max-w-[65ch] text-[15px] leading-relaxed"
                                // Sanitised by the API on every save.
                                dangerouslySetInnerHTML={{
                                    __html: product.description,
                                }}
                            />
                        ) : null}
                        {product.keyPoints.length > 0 ? (
                            <ul className="text-site-body mt-3 max-w-[65ch] list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
                                {product.keyPoints.map((point) => (
                                    <li key={point}>{point}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>
                ) : null}

                {/* 7 — made by and returns */}
                {details.length > 0 ? (
                    <section
                        className={cn(
                            (hasPhotos || hasAbout) &&
                                "border-site-border border-t pt-6",
                            hasPhotos || hasAbout
                                ? hasAbout
                                    ? "mt-6"
                                    : "mt-7"
                                : null,
                        )}
                    >
                        <h2 className={sectionTitle}>
                            <Marker n={7} show={markers} />
                            Details
                        </h2>
                        <dl className="divide-site-border mt-2 divide-y text-sm">
                            {details.map((d) => (
                                <div
                                    key={d.label}
                                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5"
                                >
                                    <dt className="text-site-muted">
                                        {d.label}
                                    </dt>
                                    <dd className="text-site-body break-words">
                                        {d.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ) : null}
            </div>
        ) : null;

    // The live page keeps the header's own margins; the workspace's
    // preview is a narrow pane and keeps the padding it has always had.
    const gutter = preview
        ? "px-4 sm:px-6"
        : "px-5 sm:px-[var(--site-page-margin,24px)]";

    return (
        <article className="bg-site-bg text-site-fg">
            {/* The way back to the shop: a product page reached from a
                search or a shared link had no link to it but the menu. */}
            {!preview && back ? (
                <nav aria-label="Breadcrumb" className={cn(gutter, "pt-5")}>
                    <a
                        href={back.href}
                        className={cn(
                            "text-site-fg coarse:min-h-11 -ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--site-radius,2px)] px-1 text-sm font-semibold underline-offset-4 hover:underline active:opacity-70",
                            focusRing,
                        )}
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M9.5 3.5 5 8l4.5 4.5"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        {back.label}
                    </a>
                </nav>
            ) : null}
            <div
                data-product-layout={hasPhotos ? "photos" : "words"}
                className={cn(
                    "grid gap-x-10 gap-y-7 pb-8 lg:gap-x-14",
                    gutter,
                    !preview && back ? "pt-3 sm:pt-4" : "pt-4 sm:pt-6",
                    hasPhotos
                        ? "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
                        : about
                          ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                          : "max-w-[44rem]",
                )}
            >
                {/* 1 — photos. A product with none draws no frame: the
                    name leads the page instead, and its words take the
                    second column. */}
                {hasPhotos ? (
                    <div className="min-w-0">
                        <div className="border-site-border bg-site-surface relative overflow-hidden rounded-[calc(var(--site-radius,2px)+8px)] border">
                            {shown?.kind === "video" ? (
                                <ProductVideo
                                    key={shown.id}
                                    video={shown}
                                    name={product.name}
                                />
                            ) : shown ? (
                                <img
                                    src={shown.url}
                                    alt={shown.alt}
                                    // The box is 4:5 whatever the file is.
                                    width={shown.width ?? 800}
                                    height={shown.height ?? 1000}
                                    {...siteImage("above")}
                                    className="aspect-[4/5] w-full object-cover"
                                />
                            ) : null}
                            <span className="absolute left-3 top-3">
                                <Marker n={1} show={markers} />
                            </span>
                        </div>
                        {product.images.length > 1 ? (
                            <div
                                role="group"
                                aria-label="Photos"
                                className="mt-2.5 grid grid-cols-5 gap-2"
                            >
                                {product.images.map((img, i) => {
                                    const video = img.kind === "video";
                                    const length = video
                                        ? videoLength(img.durationSec)
                                        : "";
                                    return (
                                        <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => setImageIndex(i)}
                                            aria-label={`Show ${video ? "video" : "photo"} ${i + 1}: ${img.alt || product.name}${length ? `, ${length}` : ""}`}
                                            aria-pressed={i === imageIndex}
                                            className={cn(
                                                "relative cursor-pointer overflow-hidden rounded-[calc(var(--site-radius,2px)+4px)] border transition-[border-color,opacity] duration-100 ease-out hover:opacity-90 active:opacity-80",
                                                focusRing,
                                                i === imageIndex
                                                    ? "border-site-fg shadow-[inset_0_0_0_1px_hsl(var(--site-fg))]"
                                                    : "border-site-border",
                                            )}
                                        >
                                            {video && !img.posterUrl ? (
                                                <span className="bg-site-surface block aspect-square w-full" />
                                            ) : (
                                                <img
                                                    src={
                                                        video
                                                            ? (img.posterUrl ??
                                                              "")
                                                            : img.url
                                                    }
                                                    alt=""
                                                    width={160}
                                                    height={160}
                                                    {...siteImage()}
                                                    className="aspect-square w-full object-cover"
                                                />
                                            )}
                                            {video ? (
                                                <VideoBadge length={length} />
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                ) : markers ? (
                    // The workspace's note 1 still has somewhere to sit.
                    <p className="text-site-body flex items-center gap-2 text-sm md:col-span-full">
                        <Marker n={1} show={markers} />
                        No photo yet
                    </p>
                ) : null}

                {hasPhotos ? (
                    <div className="min-w-0">
                        {buy}
                        {about}
                    </div>
                ) : (
                    <>
                        {/* Its own row, so both columns start level. */}
                        <span
                            aria-hidden="true"
                            className="bg-site-accent -mb-2 block h-0.5 w-10 md:col-span-full"
                        />
                        {buy}
                        {about}
                    </>
                )}
            </div>

            {/* 6 — reviews. A product nobody has reviewed says nothing
                about reviews on its live page: an empty heading and "No
                reviews yet" only tell a shopper nobody has bought it. The
                merchant's preview keeps the note, which says who can
                review. */}
            {hasReviews || preview ? (
                <section
                    className={cn("border-site-border border-t py-8", gutter)}
                >
                    <h2 className="font-site-heading flex items-center gap-2 text-[calc(1.375rem*var(--site-heading-scale,1))] font-semibold tracking-[-0.015em]">
                        <Marker n={6} show={markers} />
                        Reviews
                    </h2>
                    {hasReviews ? (
                        <>
                            <p className="text-site-body mt-1.5 text-sm">
                                {reviewed.average.toFixed(1)} out of 5, from{" "}
                                {reviewed.count} verified{" "}
                                {reviewed.count === 1 ? "buyer" : "buyers"}
                            </p>
                            <ul className="mt-5 grid gap-3 md:grid-cols-2">
                                {product.reviews.map((r) => (
                                    <li
                                        key={r.id}
                                        className="border-site-border bg-site-surface min-w-0 rounded-[calc(var(--site-radius,2px)+8px)] border p-4 sm:p-5"
                                    >
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                            <Stars rating={r.rating} />
                                            <span className="font-semibold">
                                                {r.displayName}
                                            </span>
                                            <span className="text-site-muted">
                                                · {r.dateLabel}
                                            </span>
                                        </div>
                                        {r.variantTitle ? (
                                            <p className="text-site-muted mt-1 text-xs">
                                                Bought {r.variantTitle}
                                            </p>
                                        ) : null}
                                        {r.body ? (
                                            <p className="text-site-body mt-2 break-words text-[15px] leading-relaxed">
                                                {r.body}
                                            </p>
                                        ) : null}
                                        {r.reply ? (
                                            <p className="border-site-border text-site-body mt-3 border-l-2 pl-3 text-sm leading-relaxed">
                                                <span className="text-site-fg font-semibold">
                                                    Reply from the shop:{" "}
                                                </span>
                                                {r.reply}
                                            </p>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="text-site-muted mt-1 text-sm">
                            No reviews yet. Only people who bought it can review
                            it.
                        </p>
                    )}
                </section>
            ) : null}
        </article>
    );
}
