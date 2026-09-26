"use client";

import { Button } from "@saroh/ui/button";
import { Layers, Package, Plus, Search, Store } from "lucide-react";
import Link from "next/link";

import { newProductHref } from "@/lib/products/links";
import type { EmptyCopy, ListQuery } from "@/lib/products/list-query";
import { newCollectionHref } from "@/lib/products/list-query";
import { newStorefrontHref } from "@/lib/stores/links";

/** A business with no storefront: nothing to sell from yet. */
export function NoStorefront({ canWrite }: { canWrite: boolean }) {
    return (
        <div className="flex flex-col items-center gap-[9px] rounded-[11px] border border-dashed border-border-strong px-6 py-12 text-center">
            <Store
                aria-hidden
                className="size-8 stroke-[1.7] text-muted-foreground"
            />
            <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                No storefront yet
            </p>
            <p className="max-w-[44ch] text-[13.5px] leading-[1.55] text-muted-foreground">
                A product is sold somewhere. Make a storefront first, and the
                catalogue starts here.
            </p>
            {canWrite ? (
                <Button asChild className="mt-1">
                    <Link href={newStorefrontHref}>Create a storefront</Link>
                </Button>
            ) : null}
        </div>
    );
}

/**
 * An empty list's state for DataView (#519): its icon, words and the one
 * action that fills it — Clear search, Clear filters, Show all, or Add
 * product and New collection (#524) for a role that can.
 */
export function emptyState(
    empty: EmptyCopy,
    {
        query,
        go,
        canWrite,
        storeId,
    }: {
        query: ListQuery;
        go: (patch: Partial<ListQuery>) => void;
        canWrite: boolean;
        /** Where Add product makes it. */
        storeId: string;
    },
) {
    const action =
        empty.action === "clear-search" ? (
            <Button variant="outline" onClick={() => go({ q: "" })}>
                Clear search
            </Button>
        ) : empty.action === "clear-filters" ? (
            <Button
                variant="outline"
                onClick={() =>
                    go({ status: null, category: null, collection: null })
                }
            >
                Clear filters
            </Button>
        ) : empty.action === "show-all" ? (
            <Button variant="outline" onClick={() => go({ view: "all" })}>
                Show all
            </Button>
        ) : empty.action === "add-product" && canWrite ? (
            <Button asChild>
                <Link href={newProductHref(storeId)}>Add product</Link>
            </Button>
        ) : empty.action === "new-collection" && canWrite ? (
            <Button asChild>
                <Link href={newCollectionHref(query)} scroll={false}>
                    <Plus aria-hidden />
                    New collection
                </Link>
            </Button>
        ) : undefined;
    return {
        icon:
            empty.kind === "search" ? (
                <Search />
            ) : query.view === "collections" ? (
                <Layers />
            ) : (
                <Package />
            ),
        title: empty.title,
        note: empty.note,
        action,
    };
}
