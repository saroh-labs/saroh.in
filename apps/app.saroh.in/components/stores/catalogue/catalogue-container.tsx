"use client";

import { pagesOf } from "@saroh/ui/lib/paging";
import { PageContainer } from "@saroh/ui/page-container";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useTransition } from "react";

import { QuickEditsContext } from "@/components/commerce/quick-edits/quick-edits";
import {
    catalogueFilter,
    listHref,
    readListQuery,
} from "@/lib/products/list-query";
import type { CatalogueAsk } from "@/lib/products/queries";
import { productsListKeys, productsListRead } from "@/lib/products/queries";
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
 * writes the cache first (`useQuickEditsHost`). Collections and Reviews
 * are drawn by the server: moving to or from them is a server navigation.
 */
export function CatalogueContainer({
    defaultSize,
    reviewsCount,
    showInventory,
    showReviews,
    ...screen
}: Omit<Screen, "query" | "page" | "tabs" | "adapter"> & {
    /** Rows per page when the address names none (the remembered size). */
    defaultSize: number;
    reviewsCount: number | null;
    showInventory: boolean;
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
                reviews: reviewsCount,
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
                    query={query}
                    page={page ?? null}
                    tabs={tabs}
                    adapter={adapter}
                />
            </QuickEditsContext.Provider>
        </PageContainer>
    );
}
