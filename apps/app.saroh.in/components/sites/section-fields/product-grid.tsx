"use client";

import Link from "next/link";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Skeleton } from "@saroh/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type { GridCatalogueLoad } from "@/components/sites/use-grid-catalogue";
import { useGridCatalogue } from "@/components/sites/use-grid-catalogue";
import type { ProductGridContent } from "@/lib/sites/service";

import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "./display-options";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/** The contract's cap, and the counts offered. */
const MAX_PICKED = 12;
const COUNTS = [4, 8, 12] as const;

type Source = NonNullable<ProductGridContent["source"]>;

/**
 * The `productGrid` section's editor fields (G12).
 *
 * WHICH products is chosen here, by id: the newest sold where the site sells
 * from, one collection's, or picked by hand in an order. Names, photos,
 * prices and stock are not copied in — the site reads them live, and the
 * inspector's note above says where they live (Sell › Products). A picked
 * product that is a draft, archived or deleted stays in the list until
 * removed, and the row says it won't show; the pre-publish check says so too.
 */
export function ProductGridFields(props: SectionFieldsProps<"productGrid">) {
    const catalogue = useGridCatalogue();
    return <ProductGridFieldsView {...props} catalogue={catalogue} />;
}

export function ProductGridFieldsView({
    section,
    onChange,
    catalogue,
}: Pick<SectionFieldsProps<"productGrid">, "section" | "onChange"> & {
    catalogue: GridCatalogueLoad;
}) {
    const c = section.content;
    const patch = (next: Partial<ProductGridContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const source: Source = c.source ?? "newest";

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    maxLength={160}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Our products"
                />
            </Field>

            <Field label="Show">
                <ToggleGroup
                    type="single"
                    value={source}
                    onValueChange={(v) => {
                        // Newest is the default, so it is stored as absent.
                        // Each choice keeps only its own ids.
                        if (v === "newest") {
                            patch({
                                source: undefined,
                                collectionId: undefined,
                                productIds: undefined,
                            });
                        }
                        if (v === "collection") {
                            patch({ source: v, productIds: undefined });
                        }
                        if (v === "picked") {
                            patch({
                                source: v,
                                collectionId: undefined,
                                productIds: c.productIds ?? [],
                            });
                        }
                    }}
                    aria-label="Which products show"
                    className={SEGMENTED}
                >
                    <ToggleGroupItem value="newest" className={SEGMENT}>
                        Newest
                    </ToggleGroupItem>
                    <ToggleGroupItem value="collection" className={SEGMENT}>
                        A collection
                    </ToggleGroupItem>
                    <ToggleGroupItem value="picked" className={SEGMENT}>
                        Picked
                    </ToggleGroupItem>
                </ToggleGroup>
            </Field>
            {source === "newest" ? (
                <p className="-mt-1.5 text-xs text-muted-foreground">
                    The newest products your site sells. A new product shows
                    here on its own.
                </p>
            ) : null}

            {source === "collection" ? (
                <CollectionField
                    collectionId={c.collectionId}
                    catalogue={catalogue}
                    onPick={(collectionId) => patch({ collectionId })}
                />
            ) : null}

            {source === "picked" ? (
                <PickedField
                    productIds={c.productIds ?? []}
                    catalogue={catalogue}
                    onChange={(productIds) => patch({ productIds })}
                />
            ) : null}

            <Field label="How many">
                <ToggleGroup
                    type="single"
                    value={String(c.count ?? 4)}
                    onValueChange={(v) => {
                        const n = Number(v);
                        if (!COUNTS.includes(n as (typeof COUNTS)[number])) {
                            return;
                        }
                        // Four is the default, so it is stored as absent.
                        patch({ count: n === 4 ? undefined : n });
                    }}
                    aria-label="How many products show"
                    className={SEGMENTED}
                >
                    {COUNTS.map((n) => (
                        <ToggleGroupItem
                            key={n}
                            value={String(n)}
                            className={SEGMENT}
                        >
                            {`Up to ${n}`}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Field>

            <DisplayOptions
                // Cards is how the grid has always shown, so it is absent.
                layout={c.layout ?? "cards"}
                onLayout={(v) => patch({ layout: unlessDefault(v, "cards") })}
                photos={{
                    value: c.showPhotos !== false,
                    onChange: (on) => patch({ showPhotos: hiddenFlag(on) }),
                    note: "Each card uses that product's own photo, from its page in Sell › Products.",
                }}
                descriptions={{
                    value: c.showDescriptions !== false,
                    onChange: (on) =>
                        patch({ showDescriptions: hiddenFlag(on) }),
                    note: "The first line about each product.",
                }}
                prices={{
                    value: c.showPrices !== false,
                    onChange: (on) => patch({ showPrices: hiddenFlag(on) }),
                }}
                button={{
                    value: c.buttonLabel ?? "",
                    onChange: (v) => patch({ buttonLabel: wordsOrAbsent(v) }),
                    placeholder: "View",
                    note: "Words at the foot of each card, like “View”. Leave empty for none: the whole card opens the product.",
                }}
            />
        </div>
    );
}

/** Loading, a failed read with a retry, or no access. Nothing once ready. */
function CatalogueNotice({ catalogue }: { catalogue: GridCatalogueLoad }) {
    if (catalogue.status === "ready") return null;
    if (catalogue.status === "loading") {
        return (
            <Skeleton
                className="h-9 w-full"
                aria-label="Loading your products"
            />
        );
    }
    if (catalogue.forbidden) {
        return (
            <p className="text-sm text-muted-foreground">
                Your role can&apos;t see the catalogue, so products can&apos;t
                be chosen here.
            </p>
        );
    }
    return (
        <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your products. Nothing you chose has
                changed.
            </p>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={catalogue.retry}
            >
                Try again
            </Button>
        </div>
    );
}

function CollectionField({
    collectionId,
    catalogue,
    onPick,
}: {
    collectionId: string | undefined;
    catalogue: GridCatalogueLoad;
    onPick: (collectionId: string) => void;
}) {
    if (catalogue.status !== "ready") {
        return (
            <Field label="Collection">
                <CatalogueNotice catalogue={catalogue} />
            </Field>
        );
    }
    const { collections } = catalogue;
    if (collections.length === 0) {
        return (
            <Field label="Collection">
                <p className="text-sm text-muted-foreground">
                    No collections yet.{" "}
                    <Link
                        href="/commerce/products?view=collections"
                        className="underline hover:text-foreground"
                    >
                        Make one in Sell › Products
                    </Link>
                    , then choose it here.
                </p>
            </Field>
        );
    }
    const gone =
        collectionId !== undefined &&
        !collections.some((col) => col.id === collectionId);
    return (
        <div className="grid gap-1.5">
            <Field label="Collection">
                <Select
                    value={gone ? "" : (collectionId ?? "")}
                    onValueChange={onPick}
                >
                    <SelectTrigger aria-label="Collection">
                        <SelectValue placeholder="Choose a collection" />
                    </SelectTrigger>
                    <SelectContent>
                        {collections.map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                                {`${col.name} · ${
                                    col.productCount === 1
                                        ? "1 product"
                                        : `${col.productCount} products`
                                }`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {gone ? (
                <p className="text-sm text-muted-foreground">
                    The collection this grid showed has been deleted. Choose
                    another.
                </p>
            ) : null}
        </div>
    );
}

/** Why a picked product won't show, or null when it can. */
function notShown(status: string | undefined): string | null {
    if (status === undefined) return "Deleted — not shown on the site";
    if (status === "ARCHIVED") return "Archived — not shown on the site";
    if (status === "DRAFT") return "Draft — not shown until published";
    return null;
}

function PickedField({
    productIds,
    catalogue,
    onChange,
}: {
    productIds: string[];
    catalogue: GridCatalogueLoad;
    onChange: (productIds: string[]) => void;
}) {
    if (catalogue.status !== "ready") {
        return (
            <Field label="Products">
                <div className="grid gap-2">
                    <CatalogueNotice catalogue={catalogue} />
                    {productIds.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {productIds.length === 1
                                ? "1 product picked."
                                : `${productIds.length} products picked.`}
                        </p>
                    ) : null}
                </div>
            </Field>
        );
    }
    const byId = new Map(catalogue.products.map((p) => [p.id, p]));
    // Only a published product can show; a draft is offered once published.
    const addable = catalogue.products.filter(
        (p) => p.status === "PUBLISHED" && !productIds.includes(p.id),
    );
    const full = productIds.length >= MAX_PICKED;
    const move = (index: number, by: -1 | 1) => {
        const ids = [...productIds];
        ids.splice(index + by, 0, ...ids.splice(index, 1));
        onChange(ids);
    };

    if (catalogue.products.length === 0 && productIds.length === 0) {
        return (
            <Field label="Products">
                <p className="text-sm text-muted-foreground">
                    No products yet.{" "}
                    <Link
                        href="/commerce/products"
                        className="underline hover:text-foreground"
                    >
                        Add one in Sell › Products
                    </Link>
                    , then pick it here.
                </p>
            </Field>
        );
    }

    return (
        <Field label="Products">
            <div className="grid gap-2">
                {productIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Pick the products to show, in the order they appear.
                    </p>
                ) : (
                    <ol className="grid gap-1.5">
                        {productIds.map((productId, index) => {
                            const product = byId.get(productId);
                            const name = product?.name ?? "Unknown product";
                            const note = notShown(product?.status);
                            return (
                                <li
                                    key={productId}
                                    className="flex items-center gap-1 rounded-md border px-3 py-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm">
                                            {name}
                                        </p>
                                        {note ? (
                                            <p className="text-sm text-muted-foreground">
                                                {note}
                                            </p>
                                        ) : null}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                        aria-label={`Move ${name} up`}
                                    >
                                        Up
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={
                                            index === productIds.length - 1
                                        }
                                        onClick={() => move(index, 1)}
                                        aria-label={`Move ${name} down`}
                                    >
                                        Down
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            onChange(
                                                productIds.filter(
                                                    (x) => x !== productId,
                                                ),
                                            )
                                        }
                                        aria-label={`Remove ${name}`}
                                    >
                                        Remove
                                    </Button>
                                </li>
                            );
                        })}
                    </ol>
                )}
                {full ? (
                    <p className="text-sm text-muted-foreground">
                        That is the most this grid shows.
                    </p>
                ) : addable.length > 0 ? (
                    <Select
                        value=""
                        onValueChange={(productId) =>
                            onChange([...productIds, productId])
                        }
                    >
                        <SelectTrigger
                            aria-label="Add a product"
                            className="w-auto min-w-48"
                        >
                            <SelectValue placeholder="Add a product" />
                        </SelectTrigger>
                        <SelectContent>
                            {addable.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : null}
            </div>
        </Field>
    );
}
