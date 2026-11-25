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
 * route's loader (`skeleton`) stands in until the first page lands. A
 * tab, filter or search changes the address in place and the key; the last
 * rows stay, greyed, until the new ones land. What the filter bar offers is
 * its own read, keyed on the product filter alone, so a tab or page change
 * doesn't read it again. A save reads the page once (`useOrderSave`).
 */
export function OrdersContainer({
    defaultSize,
    notices,
    skeleton,
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
    /** The route's loader, until the first page is read. */
    skeleton: ReactNode;
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
    if (!page) return skeleton;

    return (
        <PageContainer width="full">
            <OrdersScreen
                {...screen}
                notices={
                    <>
                        {notices}
                        {page.moment ? (
                            <Moment moment={page.moment} className="mb-4" />
                        ) : null}
                    </>
                }
                query={query}
                page={page}
                filterOptions={options.data?.filters ?? null}
                openByStore={options.data?.openByStore ?? null}
                pending={list.isPlaceholderData}
                share={page.share}
                onRetry={() => void list.refetch()}
            />
        </PageContainer>
    );
}
