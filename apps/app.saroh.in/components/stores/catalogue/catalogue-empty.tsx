"use client";

import { Button } from "@saroh/ui/button";
import { Layers, Package, Search, Store } from "lucide-react";
import Link from "next/link";

import { newProductHref } from "@/lib/products/links";
import type { EmptyCopy, ListQuery } from "@/lib/products/list-query";
import { newCollectionHref } from "@/lib/products/list-query";
import { newStorefrontHref } from "@/lib/stores/links";
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
                        <Link href={newStorefrontHref}>New location</Link>
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
            <Button asChild>
                <Link href={newProductHref(storeId)}>New product</Link>
            </Button>
        ) : empty.action === "new-collection" && canWrite ? (
            <Button asChild>
                <Link href={newCollectionHref(query)} scroll={false}>
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
