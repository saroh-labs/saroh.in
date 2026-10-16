"use client";

import { formatDate } from "@/lib/format/datetime";
import type { ProductPageData, StockWord } from "@saroh/site-blocks";
import { ProductPage, SiteThemeScope } from "@saroh/site-blocks";
import { useState } from "react";

import { SwitchRow } from "@/components/shared/check-row";
import { formatMoneyMajor } from "@/lib/format/money";
import { productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import {
    allergenLine,
    customFieldText,
    madeByLine,
    onTheShop,
} from "@/lib/products/overview-rules";
import {
    customerPriceNote,
    customerStockNote,
} from "@/lib/products/overview-words";
import { untrackedShort } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";
import { TextLink } from "@saroh/ui/text-link";

import type { SheetKind } from "./sheet-button";
import { SheetButton } from "./sheet-button";
import { StockSheetButton } from "./sheets/stock-sheet";

type NoteAction =
    | { label: string; sheet: SheetKind }
    | { label: string; sheet: "stock" }
    | { label: string; href: string };

/**
 * The Customer view: the product as its shop page shows it, drawn by the
 * same component the storefront will use (#465), with the team's notes
 * beside it — numbered to match the markers on the page, each opening the
 * page's own sheet that changes it, so the fix is made here. Try the
 * variants; nothing reaches a basket.
 */
export function CustomerView({
    overview,
    storeId,
    canWrite,
    counts,
    businessTracks,
    categories = [],
    shelves = null,
}: {
    overview: ProductOverview;
    storeId: string;
    canWrite: boolean;
    /** The product counts stock (Track stock, #515). */
    counts: boolean;
    /** The business's Track stock switch: off, the editor has no Stock. */
    businessTracks: boolean;
    /** For the details sheet's category. */
    categories?: { id: string; name: string }[];
    /** Its shelves, for the stock sheet; null when unread. */
    shelves?: ProductStock | null;
}) {
    const [notes, setNotes] = useState(true);
    const { product, stock, price } = overview;
    const money = (a: string) => formatMoneyMajor(a, product.currency);
    const data = toShopData(overview, counts);
    const live = product.status === "PUBLISHED";
    const option = product.option?.name ?? null;

    // As a customer meets it: in stock or sold out, not every row's count.
    const variantLines = product.variants.flatMap((v) => {
        const line = stock.variants.find((l) => l.variantId === v.id);
        return line
            ? [{ title: v.title, soldOut: line.word === "SOLD_OUT" }]
            : [];
    });

    const notesList: {
        n: number;
        title: string;
        body: string;
        action: NoteAction;
    }[] = [
        {
            n: 1,
            title: "Photos",
            body:
                product.images.length > 0
                    ? `The cover and ${product.images.length - 1} more. The same for every variant unless one picks its own.`
                    : "No photos yet.",
            action: { label: "Edit", sheet: "photos" },
        },
        {
            n: 2,
            title: "Price",
            body: customerPriceNote(
                {
                    price: product.price,
                    variantPrices: product.variants.map(
                        (v) => v.price ?? product.price,
                    ),
                    optionName: option,
                    mrp: price.mrp,
                    savingPercent: price.savingPercent,
                },
                money,
            ),
            action: { label: "Edit", sheet: "stock" },
        },
        {
            n: 3,
            title: product.variants.length > 0 ? "Variants and stock" : "Stock",
            body: !counts
                ? untrackedShort(product.storefronts ?? [])
                : variantLines.length > 0
                  ? customerStockNote(variantLines, option)
                  : stock.product
                    ? `${stock.product.canSell} to sell (${stock.product.onHand} on hand, ${stock.product.promised} promised).`
                    : "No stock count. The shop doesn't say how many are left.",
            // The stock sheet counts and prices it; untracked with nothing
            // to price, its Sold out is marked on the Overview.
            action:
                product.variants.length > 0 || (businessTracks && counts)
                    ? { label: "Edit", sheet: "stock" }
                    : {
                          label: "Open",
                          href: productHref(storeId, product.id, "overview"),
                      },
        },
        {
            n: 4,
            title: "Description and details",
            body: "Shown to everyone. Only the details switched on for the shop appear here.",
            action: { label: "Edit", sheet: "description" },
        },
        {
            n: 5,
            title: "How to use",
            body: product.howToUse
                ? onTheShop(product.shopFields, "howToUse")
                    ? "One line under the price. Every variant shares it."
                    : "Written, but Team only, so it isn't shown."
                : "Not written yet.",
            action: { label: "Edit", sheet: "details" },
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
            body: "Shown under the description when switched on for the shop.",
            action: { label: "Edit", sheet: "details" },
        },
    ];

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border py-3">
                <p className="min-w-0 flex-[1_1_280px] text-[12.5px] text-muted-foreground">
                    {live
                        ? "The shop page as a customer opens it. Try the variants. Nothing is added to a basket."
                        : product.status === "ARCHIVED"
                          ? "Archived. Customers cannot see this page. This is how it looked."
                          : "A draft. Customers cannot see this yet. This is how it will look once it is published."}
                </p>
                <SwitchRow
                    side="start"
                    checked={notes}
                    onChange={setNotes}
                    className="h-8 shrink-0 gap-2 rounded-full border border-border bg-card pl-1.5 pr-3 text-[12.5px] font-semibold hover:bg-muted coarse:h-11"
                >
                    Team notes
                </SwitchRow>
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
                                        className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background"
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
                                                <NoteButton
                                                    action={note.action}
                                                    what={note.title}
                                                    overview={overview}
                                                    storeId={storeId}
                                                    counts={counts}
                                                    shelves={shelves}
                                                    categories={categories}
                                                />
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

/** A note's way to change what it describes: a sheet here, or a tab. */
function NoteButton({
    action,
    what,
    overview,
    storeId,
    counts,
    shelves,
    categories,
}: {
    action: NoteAction;
    what: string;
    overview: ProductOverview;
    storeId: string;
    counts: boolean;
    shelves: ProductStock | null;
    categories: { id: string; name: string }[];
}) {
    if ("href" in action) {
        return (
            <TextLink
                href={action.href}
                className="text-[12px] coarse:min-h-11"
            >
                {action.label}
                <span className="sr-only"> {what}</span>
            </TextLink>
        );
    }
    const look = {
        size: "inline" as const,
        variant: "link" as const,
        icon: false,
    };
    if (action.sheet === "stock") {
        return (
            <StockSheetButton
                overview={overview}
                storeId={storeId}
                stock={shelves}
                counts={counts}
                label={action.label}
                {...look}
            />
        );
    }
    return (
        <SheetButton
            kind={action.sheet}
            label={action.label}
            ariaLabel={`${action.label} ${what}`}
            product={overview.product}
            storeId={storeId}
            categories={categories}
            className="text-[12px]"
            {...look}
        />
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
        // The product's own saving is the API's: the MRP against the
        // amount to pay, GST and all (GST is part of MRP, 12 Oct 2026).
        // None when that is the MRP or more, so nothing is struck through.
        saving:
            product.mrp !== null && overview.price.savingPercent !== null
                ? {
                      mrp: product.mrp,
                      percent: overview.price.savingPercent,
                  }
                : null,
        categoryName: product.category?.name ?? null,
        description: product.description,
        keyPoints: shown("keyPoints") ? product.keyPoints : [],
        howToUse: shown("howToUse") ? product.howToUse : null,
        materials: shown("materials") ? product.materials : null,
        materialsLabel: "Ingredients or material",
        // Who makes it and where, each on its own switch.
        maker: madeByLine(product),
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
                : "The location's rule"
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
            dateLabel: formatDate(r.createdAt, "UTC"),
        })),
    };
}
