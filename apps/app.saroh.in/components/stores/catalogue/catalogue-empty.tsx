"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { Layers, Package, Search, Store } from "lucide-react";

import { newProductHref } from "@/lib/products/links";
import type { EmptyCopy, ListQuery } from "@/lib/products/list-query";
import { newCollectionHref } from "@/lib/products/list-query";
import { importProductsHref, newStorefrontHref } from "@/lib/stores/links";
import { EmptyState } from "@saroh/ui/data-state";

/** A business with no storefront: nothing to sell from yet. */
export function NoStorefront({ canWrite }: { canWrite: boolean }) {
    return (
        <EmptyState
            icon={<Store />}
            title="No locations yet"
            description={
                canWrite
                    ? "A product is sold somewhere, so make a location first."
                    : "A product is sold somewhere, so a location comes first."
            }
            action={
                canWrite ? (
                    <Button asChild>
                        <IntentLink href={newStorefrontHref}>
                            New location
                        </IntentLink>
                    </Button>
                ) : undefined
            }
        />
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
                Show all products
            </Button>
        ) : empty.action === "add-product" && canWrite ? (
            // Both ways in (HPProductsEmptyDesk): one at a time, or a list.
            <span className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                    <IntentLink href={newProductHref(storeId)}>
                        New product
                    </IntentLink>
                </Button>
                <Button asChild variant="outline">
                    <IntentLink href={importProductsHref(storeId)}>
                        Import from a spreadsheet
                    </IntentLink>
                </Button>
            </span>
        ) : empty.action === "new-collection" && canWrite ? (
            <Button asChild>
                <IntentLink href={newCollectionHref(query)} scroll={false}>
                    New collection
                </IntentLink>
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
