import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";

import { formatMoneyMajor } from "@/lib/format/money";
import { mediaCounter } from "@/lib/products/editor-sections";
import type { EditorSection } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { optionNoun } from "@/lib/products/overview-words";
import { untrackedShort } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";

import { PublishButton } from "@/components/commerce/product-page/product-actions";
import type { SheetKind } from "@/components/commerce/product-page/sheet-button";
import { SheetButton } from "@/components/commerce/product-page/sheet-button";
import { StockSheetButton } from "@/components/commerce/product-stock/stock-sheet";

type Cta =
    | { label: string; sheet: SheetKind }
    | { label: string; sheet: "stock" }
    | { label: string; section: EditorSection };

/**
 * "Before it goes live" — a draft's checklist. Nothing here is required
 * to publish; these are what a customer will look for, each opening the
 * page's own sheet that fills it, so the draft is finished here. It ends
 * with Publish, the same act as the header's. Variants are made in the
 * editor, the one place that adds them.
 */
export function DraftChecklist({
    overview,
    storeId,
    edit,
    canWrite,
    counts,
    shelves,
    categories,
}: {
    overview: ProductOverview;
    storeId: string;
    edit: (section?: EditorSection) => string;
    canWrite: boolean;
    /** The product counts stock (Track stock, #515). */
    counts: boolean;
    /** Its shelves, for the stock sheet; null when that read failed. */
    shelves: ProductStock | null;
    categories: { id: string; name: string }[];
}) {
    const { product, stock } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency);
    const tracked = stock.mode === "variant" || stock.product !== null;
    const rows: {
        done: boolean;
        title: string;
        sub: string;
        cta?: Cta;
    }[] = [
        {
            done: true,
            title: "Name and price",
            sub: `${product.name} · ${money(product.price)}`,
        },
        {
            done: product.images.length > 0,
            title: "Photos",
            sub:
                product.images.length > 0
                    ? `${mediaCounter(product.images)}. The first photo is the cover.`
                    : "No photos yet. Up to 15 photos and 3 videos.",
            cta: { label: "Add photos", sheet: "photos" },
        },
        {
            done: Boolean(product.description),
            title: "Description",
            sub: product.description ? "Written." : "Nothing written yet.",
            cta: { label: "Write it", sheet: "description" },
        },
        {
            done: product.howToUse !== null || product.materials !== null,
            title: "How to use and what it's made of",
            sub:
                product.howToUse !== null || product.materials !== null
                    ? "Set."
                    : "Not set. The shop says nothing rather than guessing.",
            cta: { label: "Add", sheet: "details" },
        },
        counts
            ? {
                  done: tracked,
                  title: "Stock",
                  sub: tracked
                      ? `${stock.totals.onHand} on hand.`
                      : "No stock count yet.",
                  cta: { label: "Add stock", sheet: "stock" },
              }
            : {
                  done: true,
                  title: "Stock",
                  sub: untrackedShort(overview.product.storefronts ?? []),
              },
        {
            done: product.variants.length > 0,
            title: "Variants",
            sub:
                product.variants.length > 0
                    ? `${product.variants.length}: ${product.variants.map((v) => v.title).join(", ")}.`
                    : `Optional. Sold as itself at ${money(product.price)} until you add ${optionNoun(product.option?.name, 2)}.`,
            cta: {
                label: `Add ${optionNoun(product.option?.name, 2)}`,
                section: "variants",
            },
        },
    ];

    return (
        <Card className="px-5 py-4">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.015em]">
                Before it goes live
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
                A draft. Only the team can see it. Nothing here is required to
                publish. These are what customers will look for.
            </p>
            <ul className="mt-3 divide-y divide-border">
                {rows.map((row) => (
                    <li
                        key={row.title}
                        className="flex flex-wrap items-center gap-3 py-2.5"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "grid size-[22px] shrink-0 place-items-center rounded-full",
                                row.done
                                    ? "bg-success-subtle text-success-subtle-foreground"
                                    : "border-[1.5px] border-dashed border-border-strong",
                            )}
                        >
                            {row.done ? <Check className="size-3.5" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium">
                                {row.title}
                                <span className="sr-only">
                                    {row.done ? ", done" : ", to do"}
                                </span>
                            </p>
                            <p className="text-[12.5px] text-muted-foreground">
                                {row.sub}
                            </p>
                        </div>
                        {!row.done && row.cta && canWrite ? (
                            <ChecklistCta
                                cta={row.cta}
                                overview={overview}
                                storeId={storeId}
                                edit={edit}
                                counts={counts}
                                stock={shelves}
                                categories={categories}
                            />
                        ) : null}
                    </li>
                ))}
            </ul>
            {canWrite ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    <PublishButton product={product} />
                    <p className="text-[12.5px] text-muted-foreground">
                        Publishing makes it live at once, with Undo.
                    </p>
                </div>
            ) : null}
        </Card>
    );
}

function ChecklistCta({
    cta,
    overview,
    storeId,
    edit,
    counts,
    stock,
    categories,
}: {
    cta: Cta;
    overview: ProductOverview;
    storeId: string;
    edit: (section?: EditorSection) => string;
    counts: boolean;
    stock: ProductStock | null;
    categories: { id: string; name: string }[];
}) {
    if ("section" in cta) {
        return (
            <Button asChild variant="outline" size="sm">
                <Link href={edit(cta.section)}>{cta.label}</Link>
            </Button>
        );
    }
    if (cta.sheet === "stock") {
        return (
            <StockSheetButton
                overview={overview}
                storeId={storeId}
                stock={stock}
                counts={counts}
                label={cta.label}
                size="sm"
                icon={false}
            />
        );
    }
    return (
        <SheetButton
            kind={cta.sheet}
            label={cta.label}
            product={overview.product}
            storeId={storeId}
            categories={categories}
            size="sm"
            icon={false}
            className=""
        />
    );
}
