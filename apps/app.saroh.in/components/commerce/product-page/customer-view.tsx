"use client";

import type { ProductPageData, StockWord } from "@saroh/site-blocks";
import { ProductPage, SiteThemeScope } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import type { EditorSection } from "@/lib/products/links";
import { productEditHref, productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import {
    allergenLine,
    customFieldText,
    onTheShop,
} from "@/lib/products/overview-rules";
import { untrackedShort } from "@/lib/products/tracking";

/**
 * The Customer view: the product as its shop page shows it, drawn by the
 * same component the storefront will use (#465), with the team's notes
 * beside it — numbered to match the markers on the page, each opening the
 * editor section it describes. Try the variants; nothing reaches a basket.
 */
export function CustomerView({
    overview,
    storeId,
    canWrite,
    counts,
}: {
    overview: ProductOverview;
    storeId: string;
    canWrite: boolean;
    /** The product counts stock (Track stock, #515). */
    counts: boolean;
}) {
    const [notes, setNotes] = useState(true);
    const { product, stock, price } = overview;
    const money = (a: string) => formatMoneyMajor(a, product.currency) ?? a;
    const edit = (s: EditorSection) => productEditHref(storeId, product.id, s);
    const data = toShopData(overview, counts);
    const live = product.status === "PUBLISHED";

    const variantLine = product.variants
        .map((v) => {
            const line = stock.variants.find((l) => l.variantId === v.id);
            return line
                ? `${v.title}: ${line.canSell} can sell (${line.onHand} on hand, ${line.promised} promised)`
                : null;
        })
        .filter(Boolean)
        .join(". ");

    const notesList: {
        n: number;
        title: string;
        body: string;
        action: { label: string; href: string };
    }[] = [
        {
            n: 1,
            title: "Photos",
            body:
                product.images.length > 0
                    ? `The cover and ${product.images.length - 1} more. The same for every variant unless one picks its own.`
                    : "No photos yet.",
            action: { label: "Edit", href: edit("photos") },
        },
        {
            n: 2,
            title: "Price",
            body:
                product.variants.length > 0
                    ? `Follows the variant picked: ${product.variants.map((v) => `${v.title} ${money(v.price ?? product.price)}`).join(", ")}.${price.mrp ? ` MRP ${money(price.mrp)} is shown struck through.` : ""}`
                    : `${money(product.price)}${price.mrp ? `, with MRP ${money(price.mrp)} struck through` : ""}.`,
            action: { label: "Edit", href: edit("basics") },
        },
        {
            n: 3,
            title: product.variants.length > 0 ? "Variants and stock" : "Stock",
            body: !counts
                ? untrackedShort(product.storefronts ?? [])
                : variantLine ||
                  (stock.product
                      ? `${stock.product.canSell} can sell (${stock.product.onHand} on hand, ${stock.product.promised} promised).`
                      : "No stock count — the shop doesn't say how many are left."),
            action: {
                label: "Edit",
                href: edit(product.variants.length > 0 ? "variants" : "stock"),
            },
        },
        {
            n: 4,
            title: "Description and details",
            body: "Shown to everyone. Only the details switched to On the shop appear here.",
            action: { label: "Edit", href: edit("description") },
        },
        {
            n: 5,
            title: "How to use",
            body: product.howToUse
                ? onTheShop(product.shopFields, "howToUse")
                    ? "One line under the price. Every variant shares it."
                    : "Written, but Team only — so it isn't shown."
                : "Not written yet.",
            action: { label: "Edit", href: edit("details") },
        },
        {
            n: 6,
            title: "Reviews",
            body: "The latest ones customers can see. Reply or hide one from the Reviews tab.",
            action: {
                label: "Manage",
                href: productHref(storeId, product.id, "reviews"),
            },
        },
        {
            n: 7,
            title: "Made by and returns",
            body: "Shown under the description when switched to On the shop.",
            action: { label: "Edit", href: edit("madeby") },
        },
    ];

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border py-3">
                <p className="min-w-0 flex-[1_1_280px] text-[12.5px] text-muted-foreground">
                    {live
                        ? "The shop page as a customer opens it. Try the variants — nothing is added to a basket."
                        : product.status === "ARCHIVED"
                          ? "Archived — customers cannot see this page. This is how it looked."
                          : "A draft — customers cannot see this yet. This is how it will look once it is published."}
                </p>
                <button
                    type="button"
                    role="switch"
                    aria-checked={notes}
                    onClick={() => setNotes((v) => !v)}
                    className="flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3 text-[12.5px] font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                >
                    <span
                        aria-hidden
                        className={cn(
                            "relative inline-block h-[18px] w-[30px] rounded-full transition-colors",
                            notes ? "bg-foreground" : "bg-border-strong",
                        )}
                    >
                        <span
                            className={cn(
                                "absolute top-[2px] size-[14px] rounded-full bg-background transition-[left]",
                                notes ? "left-[14px]" : "left-[2px]",
                            )}
                        />
                    </span>
                    Team notes
                </button>
            </div>
            <div className="mt-[22px] flex flex-wrap items-start gap-[22px] rounded-[12px] bg-muted/60 p-4 sm:p-[22px]">
                <div className="min-w-0 flex-[1_1_540px] overflow-hidden rounded-xl border border-border shadow-sm">
                    <SiteThemeScope name={`product-${product.id}`}>
                        <ProductPage product={data} markers={notes} preview />
                    </SiteThemeScope>
                </div>
                {notes ? (
                    <ol className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 lg:max-w-[340px]">
                        {notesList.map((note) => (
                            <li
                                key={note.n}
                                className="rounded-[11px] border border-border bg-card px-3.5 py-3"
                            >
                                <div className="flex gap-2.5">
                                    <span
                                        aria-hidden
                                        className="grid size-5 shrink-0 place-items-center rounded-full bg-highlight text-[11px] font-bold text-highlight-foreground"
                                    >
                                        {note.n}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <p className="flex-1 text-[13px] font-semibold">
                                                <span className="sr-only">
                                                    Note {note.n}:{" "}
                                                </span>
                                                {note.title}
                                            </p>
                                            {canWrite || note.n === 6 ? (
                                                <Link
                                                    href={note.action.href}
                                                    className="text-[12px] text-brand hover:text-foreground coarse:min-h-11"
                                                >
                                                    {note.action.label}
                                                    <span className="sr-only">
                                                        {" "}
                                                        {note.title}
                                                    </span>
                                                </Link>
                                            ) : null}
                                        </div>
                                        <p className="mt-[3px] text-pretty text-[12px] leading-[1.5] text-foreground/75">
                                            {note.body}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                ) : null}
            </div>
        </div>
    );
}

/** The product page's read, as the shop page component takes it. */
export function toShopData(
    overview: ProductOverview,
    counts = true,
): ProductPageData {
    const { product, reviews } = overview;
    // Untracked (#515): no count, so the shop says "Sold out" only where
    // it was marked sold out by hand — at this storefront, every variant.
    const markedSoldOut = !counts && product.soldOut === true;
    const stock = counts
        ? overview.stock
        : { ...overview.stock, variants: [], product: null };
    const shown = (k: Parameters<typeof onTheShop>[1]) =>
        onTheShop(product.shopFields, k);
    const word = (canSell: number, w: string): StockWord =>
        w === "SOLD_OUT"
            ? "SOLD_OUT"
            : w === "LOW"
              ? "LOW"
              : canSell >= 0
                ? "IN_STOCK"
                : "UNTRACKED";
    const published =
        reviews.status === "ok"
            ? reviews.data.latest.filter((r) => r.status === "PUBLISHED")
            : [];
    const summary = reviews.status === "ok" ? reviews.data.summary : null;
    return {
        name: product.name,
        currency: product.currency,
        price: product.price,
        mrp: product.mrp,
        categoryName: product.category?.name ?? null,
        description: product.description,
        keyPoints: shown("keyPoints") ? product.keyPoints : [],
        howToUse: shown("howToUse") ? product.howToUse : null,
        materials: shown("materials") ? product.materials : null,
        materialsLabel: "Ingredients or material",
        // Who makes it and where, each on its own switch.
        maker: product.madeHere
            ? shown("maker")
                ? overview.storefront.name
                : null
            : [
                  shown("maker") ? product.maker : null,
                  shown("madeIn") ? product.madeIn : null,
              ]
                  .filter(Boolean)
                  .join(", ") || null,
        warranty: shown("warranty") ? product.warranty : null,
        extras: [
            // Allergens always show when ticked: the shop never claims a
            // product is free of one it does not list.
            ...(allergenLine(product.allergens)
                ? [
                      {
                          label: "Allergens",
                          value: allergenLine(product.allergens),
                      },
                  ]
                : []),
            ...product.customFields
                .filter((f) => f.onShop && f.value !== null)
                .map((f) => ({ label: f.name, value: customFieldText(f) })),
        ],
        returns: shown("returns")
            ? product.returnsMode === "OWN"
                ? product.returnsText
                : "The storefront's rule"
            : null,
        images: product.images.map((i) => ({
            id: i.id,
            url: i.url,
            alt: i.alt,
            width: i.width,
            height: i.height,
            kind: i.kind,
            durationSec: i.durationSec,
            posterUrl: i.posterUrl,
        })),
        optionName: product.option?.name ?? null,
        variants: product.variants.map((v) => {
            // A variant with no count of its own sells from the product's,
            // while the product still counts as a whole.
            const line =
                stock.variants.find((l) => l.variantId === v.id) ??
                stock.product;
            return {
                id: v.id,
                title: v.title,
                price: v.price,
                mrp: v.mrp ?? null,
                imageId: v.imageId ?? null,
                stock: markedSoldOut
                    ? "SOLD_OUT"
                    : line
                      ? word(line.canSell, line.word)
                      : "UNTRACKED",
                left: markedSoldOut ? null : (line?.canSell ?? null),
            };
        }),
        stock: markedSoldOut
            ? { word: "SOLD_OUT", left: null }
            : stock.product
              ? {
                    word: word(stock.product.canSell, stock.product.word),
                    left: stock.product.canSell,
                }
              : null,
        rating:
            summary && summary.average !== null && summary.count > 0
                ? { average: summary.average, count: summary.count }
                : null,
        reviews: published.slice(0, 4).map((r) => ({
            id: r.id,
            rating: r.rating,
            body: r.body,
            displayName: r.displayName,
            variantTitle: r.variantTitle,
            reply: r.reply,
            // A day is a day wherever it is read; pinned so the server and
            // the browser render the same text.
            dateLabel: new Date(r.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
            }),
        })),
    };
}
