"use client";

import { PartialRead } from "@saroh/ui/failed-read";
import { pagesOf } from "@saroh/ui/lib/paging";
import { PageContainer } from "@saroh/ui/page-container";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useTransition } from "react";

import { CollectionsPanel } from "@/components/commerce/collections/collections-panel";
import { QuickEditsContext } from "@/components/commerce/quick-edits/quick-edits";
import { useCollections } from "@/lib/collections/use-collections";
import { useProductReviews } from "@/lib/product-reviews/use-product-reviews";
import { choicesFrom } from "@/lib/products/filter-choices";
import {
    catalogueFilter,
    listHref,
    readListQuery,
} from "@/lib/products/list-query";
import type { CatalogueAsk } from "@/lib/products/queries";
import { productsListKeys, productsListRead } from "@/lib/products/queries";
import { useCategories } from "@/lib/products/use-product-settings";
import {
    useProductsList,
    useQuickEditsHost,
} from "@/lib/products/use-products";
import { useOrgId } from "@/lib/query/org";

import type { ListAdapter } from "./catalogue-screen";
import { CatalogueScreen } from "./catalogue-screen";
import type { ProductsTab } from "./products-tabs";
import { ProductsTabs } from "./products-tabs";

type Screen = ComponentProps<typeof CatalogueScreen>;

/**
 * Sell → Products on React Query (DEC-259): the same `CatalogueScreen`, its
 * page a query keyed on what the address asks for, read in the browser.
 * The frame (header, New product, tabs, search, filters) is drawn at once
 * and works; the rows, counts and Needs you wait for the first page (owner,
 * 25 Nov). A filter, a sort or a search changes the address in place (no
 * server render) and the key; the last rows stay, greyed, until the new
 * ones land, and Back draws a seen page from the cache. A quick edit
 * writes the cache first (`useQuickEditsHost`). The side reads are their
 * own queries: the reviews (the tab's count, the rows' stars), the
 * categories and collections (the Filter's choices, the Collections
 * cards); one that fails leaves its part out, said, never the list.
 * Moving to or from Collections or Reviews is a server navigation (the
 * page's gates choose the view).
 */
export function CatalogueContainer({
    defaultSize,
    showInventory,
    showReviews,
    notice,
    ...screen
}: Omit<
    Screen,
    | "query"
    | "page"
    | "tabs"
    | "adapter"
    | "ratings"
    | "choices"
    | "collectionCount"
    | "collectionsPanel"
> & {
    /** Rows per page when the address names none (the remembered size). */
    defaultSize: number;
    showInventory: boolean;
    /** A role that may read reviews: their tab, count and stars. */
    showReviews: boolean;
}) {
    const router = useRouter();
    const qc = useQueryClient();
    const orgId = useOrgId();
    const search = useSearchParams();
    const [serverNav, startServerNav] = useTransition();

    const query = useMemo(() => {
        const q = readListQuery(
            Object.fromEntries(search.entries()),
            defaultSize,
        );
        // A storefront that isn't this business's is no filter.
        if (q.storefront && !screen.stores.some((s) => s.id === q.storefront)) {
            q.storefront = null;
        }
        return q;
    }, [search, defaultSize, screen.stores]);
    const list = useProductsList(catalogueFilter(query));
    const quick = useQuickEditsHost();
    const page = list.data;
    const reviews = useProductReviews(showReviews);
    const categories = useCategories(query.option ? { options: "1" } : {});
    const collections = useCollections();
    // Unread, a section is left out of the Filter (null); on its way, empty.
    const sideRows = <T,>(rows: T[] | undefined, isError: boolean) =>
        rows ?? (isError ? null : []);
    const choices = choicesFrom(
        sideRows(categories.data?.categories, categories.isError),
        sideRows(collections.data, collections.isError),
        query.option
            ? sideRows(
                  categories.data?.options ?? undefined,
                  categories.isError || categories.data?.options === null,
              )
            : undefined,
    );
    const openNew = search.get("new") === "collection";

    // The page's last rows have gone (deleted, or out of this view): the
    // last page that still holds some, in place.
    useEffect(() => {
        if (page?.items.length === 0 && query.page > 1) {
            const last = Math.max(1, pagesOf(page.total, query.size));
            window.history.replaceState(
                null,
                "",
                listHref(query, { page: Math.min(query.page - 1, last) }),
            );
        }
    }, [page, query]);

    // A failed read is not an empty list: the segment's error boundary.
    if (list.isError && !page) throw list.error;

    const adapter: ListAdapter = {
        navigate(href) {
            const to = new URL(href, window.location.origin);
            if (
                query.view === "collections" ||
                to.searchParams.get("tab") === "collections" ||
                to.searchParams.get("tab") === "reviews"
            ) {
                startServerNav(() => router.push(href, { scroll: false }));
                return;
            }
            window.history.replaceState(null, "", href);
        },
        reload: () =>
            qc.invalidateQueries({ queryKey: productsListKeys(orgId) }),
        find: (ask: CatalogueAsk) =>
            qc.fetchQuery(productsListRead.options(orgId, ask)),
        fetching: serverNav || list.isPlaceholderData,
    };

    const active: ProductsTab =
        query.view === "collections" || query.view === "inventory"
            ? query.view
            : "all";
    const tabs = (
        <ProductsTabs
            active={active}
            counts={{
                all: page?.counts.all,
                collections: page?.counts.collections,
                inventory: page?.counts.inventory,
                reviews: reviews.data
                    ? reviews.data.reviews.length
                    : reviews.isError
                      ? null
                      : undefined,
            }}
            hrefs={{
                all: listHref(query, { view: "all" }),
                collections: listHref(query, { view: "collections" }),
                inventory: listHref(query, { view: "inventory" }),
                reviews: "/commerce/products?tab=reviews",
            }}
            showInventory={showInventory}
            showReviews={showReviews}
        />
    );

    return (
        <PageContainer width="full">
            <QuickEditsContext.Provider value={quick}>
                <CatalogueScreen
                    {...screen}
                    notice={
                        <>
                            {reviews.isError ? (
                                <PartialRead
                                    things="reviews"
                                    so="Their count can't be shown. It is not zero."
                                />
                            ) : null}
                            {notice}
                        </>
                    }
                    ratings={reviews.data?.ratings ?? []}
                    choices={choices}
                    collectionCount={
                        collections.data
                            ? collections.data.length
                            : collections.isError
                              ? null
                              : undefined
                    }
                    collectionsPanel={
                        active === "collections" && !collections.isPending ? (
                            <CollectionsPanel
                                collections={collections.data ?? null}
                                categories={categories.data?.categories ?? []}
                                canWrite={screen.canWrite}
                                activeId={query.collection}
                                hrefs={Object.fromEntries(
                                    (collections.data ?? []).map((c) => [
                                        c.id,
                                        listHref(query, { collection: c.id }),
                                    ]),
                                )}
                                clearHref={listHref(query, {
                                    collection: null,
                                })}
                                openNew={openNew}
                                closeNewHref={listHref(query)}
                            />
                        ) : null
                    }
                    query={query}
                    page={page ?? null}
                    tabs={tabs}
                    adapter={adapter}
                />
            </QuickEditsContext.Provider>
        </PageContainer>
    );
}
