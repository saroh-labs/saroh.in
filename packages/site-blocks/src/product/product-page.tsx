"use client";

import { useState } from "react";

import { cn } from "../lib/utils";

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
 * the photo — the way a customer tries sizes. In `preview` mode the basket
 * button is shown but does nothing, and says so.
 *
 * `markers` draws numbered badges on each area so a panel beside the preview
 * can explain them (1 photos, 2 price, 3 variants and stock, 4 description and
 * details, 5 how to use, 6 reviews, 7 made by and returns).
 */

export type StockWord = "IN_STOCK" | "LOW" | "SOLD_OUT" | "UNTRACKED";

export interface ProductPageImage {
    id: string;
    url: string;
    alt: string;
    width?: number | null;
    height?: number | null;
}

export interface ProductPageVariant {
    id: string;
    title: string;
    /** Null = the product's price. */
    price: string | null;
    mrp: string | null;
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
    mrp: string | null;
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
    images: ProductPageImage[];
    optionName: string | null;
    variants: ProductPageVariant[];
    /** A product without variants: its own stock. */
    stock: { word: StockWord; left: number | null } | null;
    rating: { average: number; count: number } | null;
    reviews: ProductPageReview[];
}

export function formatAmount(
    amount: string,
    currency: string,
    locale = "en-IN",
): string {
    const value = Number(amount);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
        }).format(value);
    } catch {
        return amount;
    }
}

/** Whole percent off, rounded down, or null when nothing is off. */
export function percentOff(price: string, mrp: string | null): number | null {
    if (mrp === null) return null;
    const p = Math.round(Number(price) * 100);
    const m = Math.round(Number(mrp) * 100);
    if (!(m > p) || m === 0) return null;
    return Math.floor(((m - p) * 100) / m);
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

export default function ProductPage({
    product,
    markers = false,
    preview = true,
    locale = "en-IN",
    onAddToBasket,
}: {
    product: ProductPageData;
    markers?: boolean;
    preview?: boolean;
    locale?: string;
    onAddToBasket?: (variantId: string | null) => void;
}) {
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
    const mrp = variant?.mrp ?? product.mrp;
    const off = percentOff(price, mrp);
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

    function addToBasket() {
        if (soldOut) return;
        if (preview) {
            setNotice("This is a preview — nothing is added to a basket.");
            return;
        }
        onAddToBasket?.(variant?.id ?? null);
    }

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
    ];

    return (
        <article className="bg-site-bg text-site-fg">
            <div className="grid gap-[var(--site-grid-gap,14px)] p-4 sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-8">
                {/* 1 — photos */}
                <div className="min-w-0">
                    <div className="border-site-border bg-site-surface relative overflow-hidden rounded-[var(--site-radius,2px)] border">
                        {shown ? (
                            <img
                                src={shown.url}
                                alt={shown.alt}
                                width={shown.width ?? undefined}
                                height={shown.height ?? undefined}
                                className="aspect-[4/5] w-full object-cover"
                            />
                        ) : (
                            <div className="text-site-muted grid aspect-[4/5] w-full place-items-center text-sm">
                                No photo yet
                            </div>
                        )}
                        <span className="absolute left-3 top-3">
                            <Marker n={1} show={markers} />
                        </span>
                    </div>
                    {product.images.length > 1 ? (
                        <div
                            role="group"
                            aria-label="Photos"
                            className="mt-2 grid grid-cols-5 gap-2"
                        >
                            {product.images.map((img, i) => (
                                <button
                                    key={img.id}
                                    type="button"
                                    onClick={() => setImageIndex(i)}
                                    aria-label={`Show photo ${i + 1}: ${img.alt || product.name}`}
                                    aria-pressed={i === imageIndex}
                                    className={cn(
                                        "overflow-hidden rounded-[var(--site-radius,2px)] border",
                                        i === imageIndex
                                            ? "border-site-fg"
                                            : "border-site-border",
                                    )}
                                >
                                    <img
                                        src={img.url}
                                        alt=""
                                        className="aspect-square w-full object-cover"
                                    />
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="min-w-0">
                    {product.categoryName ? (
                        <p className="text-site-muted text-xs uppercase tracking-[0.12em]">
                            {product.categoryName}
                        </p>
                    ) : null}
                    <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                        {product.name}
                    </h1>
                    {product.rating ? (
                        <p className="text-site-body mt-2 flex items-center gap-2 text-sm">
                            <Stars rating={product.rating.average} />
                            <span>
                                {product.rating.average.toFixed(1)} ·{" "}
                                {product.rating.count}{" "}
                                {product.rating.count === 1
                                    ? "review"
                                    : "reviews"}
                            </span>
                        </p>
                    ) : null}

                    {/* 2 — price */}
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Marker n={2} show={markers} />
                        <span className="text-2xl font-semibold tabular-nums">
                            {formatAmount(price, product.currency, locale)}
                        </span>
                        {off !== null && mrp ? (
                            <>
                                <span className="text-site-muted text-sm tabular-nums line-through">
                                    <span className="sr-only">MRP </span>
                                    {formatAmount(
                                        mrp,
                                        product.currency,
                                        locale,
                                    )}
                                </span>
                                <span className="text-site-fg text-sm font-medium">
                                    {off}% off
                                </span>
                            </>
                        ) : null}
                    </div>
                    {mrp ? (
                        <p className="text-site-muted mt-1 text-xs">
                            Inclusive of all taxes
                        </p>
                    ) : null}

                    {/* 5 — how to use / care, one line under the price */}
                    {product.howToUse ? (
                        <p className="text-site-body mt-3 flex items-start gap-2 text-sm">
                            <Marker n={5} show={markers} />
                            <span>{product.howToUse}</span>
                        </p>
                    ) : null}

                    {/* 3 — variants and stock */}
                    {product.variants.length > 0 ? (
                        <fieldset className="mt-5">
                            <legend className="flex items-center gap-2 text-sm font-medium">
                                <Marker n={3} show={markers} />
                                {product.optionName ?? "Choose"}
                                {variant ? (
                                    <span className="text-site-muted font-normal">
                                        : {variant.title}
                                    </span>
                                ) : null}
                            </legend>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {product.variants.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        onClick={() => pick(v)}
                                        aria-pressed={v.id === variantId}
                                        className={cn(
                                            "min-h-11 min-w-11 rounded-[var(--site-radius,2px)] border px-3 text-sm",
                                            v.id === variantId
                                                ? "border-site-fg bg-site-fg text-site-bg"
                                                : "border-site-border text-site-fg",
                                            v.stock === "SOLD_OUT" &&
                                                "text-site-muted decoration-site-muted line-through",
                                        )}
                                    >
                                        {v.title}
                                        {v.stock === "SOLD_OUT" ? (
                                            <span className="sr-only">
                                                {" "}
                                                — sold out
                                            </span>
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
                                    : "text-site-fg font-medium",
                            )}
                        >
                            {product.variants.length === 0 ? (
                                <Marker n={3} show={markers} />
                            ) : null}
                            {stockLabel(stock.word, stock.left)}
                        </p>
                    ) : null}

                    <button
                        type="button"
                        onClick={addToBasket}
                        disabled={soldOut}
                        className="bg-site-accent text-site-accent-fg mt-5 min-h-11 w-full rounded-[var(--site-radius,2px)] px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                        {soldOut ? "Sold out" : "Add to basket"}
                    </button>
                    {notice ? (
                        <p
                            role="status"
                            className="text-site-muted mt-2 text-xs"
                        >
                            {notice}
                        </p>
                    ) : null}

                    {/* 4 — description and details */}
                    {product.description || product.keyPoints.length > 0 ? (
                        <section className="border-site-border mt-6 border-t pt-5">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <Marker n={4} show={markers} />
                                About this product
                            </h2>
                            {product.description ? (
                                <div
                                    className="prose prose-sm prose-headings:text-site-fg prose-p:text-site-body prose-strong:text-site-fg prose-li:text-site-body prose-a:text-site-accent mt-2 max-w-none"
                                    // Sanitised by the API on every save.
                                    dangerouslySetInnerHTML={{
                                        __html: product.description,
                                    }}
                                />
                            ) : null}
                            {product.keyPoints.length > 0 ? (
                                <ul className="text-site-body mt-3 list-disc space-y-1 pl-5 text-sm">
                                    {product.keyPoints.map((point) => (
                                        <li key={point}>{point}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ) : null}

                    {/* 7 — made by and returns */}
                    {details.length > 0 ? (
                        <section className="border-site-border mt-5 border-t pt-5">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <Marker n={7} show={markers} />
                                Details
                            </h2>
                            <dl className="divide-site-border mt-2 divide-y text-sm">
                                {details.map((d) => (
                                    <div
                                        key={d.label}
                                        className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2"
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
            </div>

            {/* 6 — reviews */}
            <section className="border-site-border border-t px-4 py-6 sm:px-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Marker n={6} show={markers} />
                    Reviews
                </h2>
                {product.rating && product.reviews.length > 0 ? (
                    <>
                        <p className="text-site-body mt-1 text-sm">
                            {product.rating.average.toFixed(1)} out of 5, from{" "}
                            {product.rating.count} verified{" "}
                            {product.rating.count === 1 ? "buyer" : "buyers"}
                        </p>
                        <ul className="mt-4 grid gap-4 md:grid-cols-2">
                            {product.reviews.map((r) => (
                                <li
                                    key={r.id}
                                    className="border-site-border bg-site-surface min-w-0 rounded-[var(--site-radius,2px)] border p-4"
                                >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <Stars rating={r.rating} />
                                        <span className="font-medium">
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
                                        <p className="text-site-body mt-2 break-words text-sm">
                                            {r.body}
                                        </p>
                                    ) : null}
                                    {r.reply ? (
                                        <p className="border-site-border text-site-body mt-3 border-l-2 pl-3 text-sm">
                                            <span className="text-site-fg font-medium">
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
                        No reviews yet. Only people who bought it can review it.
                    </p>
                )}
            </section>
        </article>
    );
}
