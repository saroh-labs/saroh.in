"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { Moment } from "@/components/shared/notices/moment";
import { ordersHref, readOrdersQuery } from "@/lib/orders/list-query";
import { ordersAsk } from "@/lib/orders/queries";
import { useOrdersList, useOrdersOptions } from "@/lib/orders/use-orders";

import { OrdersScreen } from "./orders-screen";

type Screen = ComponentProps<typeof OrdersScreen>;

/**
 * Sell → Orders on React Query (DEC-259): the same `OrdersScreen`, its page
 * a query keyed on what the address asks for, read in the browser; the
 * screen's whole frame (header, New order, search, filters) is drawn at
 * once and works, its rows skeletons until the first page lands (owner,
 * 25 Nov). A tab, filter or search changes the address in place and the
 * key; the last
 * rows stay, greyed, until the new ones land. What the filter bar offers is
 * its own read, keyed on the product filter alone, so a tab or page change
 * doesn't read it again. A save reads the page once (`useOrderSave`).
 */
export function OrdersContainer({
    defaultSize,
    notices,
    ...screen
}: Omit<
    Screen,
    | "query"
    | "page"
    | "filterOptions"
    | "openByStore"
    | "pending"
    | "onRetry"
    | "share"
> & {
    /** Rows per page when the address names none (the remembered size). */
    defaultSize: number;
    notices: ReactNode;
}) {
    const search = useSearchParams();
    const query = useMemo(
        () => readOrdersQuery(Object.fromEntries(search), defaultSize),
        [search, defaultSize],
    );
    const list = useOrdersList(ordersAsk(query));
    const options = useOrdersOptions({ product: query.product ?? undefined });
    const page = list.data;

    // A page past the end (the list has since got shorter): the first, in
    // place, as the server redirects a typed one.
    useEffect(() => {
        if (page?.rows.length === 0 && query.page > 1) {
            window.history.replaceState(
                null,
                "",
                ordersHref(query, { page: 1 }),
            );
        }
    }, [page, query]);

    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (list.isError && !page) throw list.error;

    return (
        <PageContainer width="full">
            <OrdersScreen
                {...screen}
                notices={
                    <>
                        {notices}
                        {page?.moment ? (
                            <Moment moment={page.moment} className="mb-4" />
                        ) : null}
                    </>
                }
                query={query}
                page={page ?? null}
                filterOptions={options.data?.filters ?? null}
                openByStore={options.data?.openByStore ?? null}
                pending={list.isPlaceholderData}
                share={page?.share ?? null}
                onRetry={() => void list.refetch()}
            />
        </PageContainer>
    );
}
