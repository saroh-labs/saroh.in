"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { CustomersTabs } from "@/components/customers/data-requests/customers-tabs";
import { OpenRequestsBanner } from "@/components/customers/data-requests/open-requests-banner";
import {
    allowedQuery,
    listHref,
    listMay,
    readListQuery,
} from "@/lib/customers/list";
import { customersAsk } from "@/lib/customers/queries";
import {
    useCustomerRequests,
    useCustomersList,
} from "@/lib/customers/use-customers";

import { CustomersList } from "./customers-list";

type Screen = ComponentProps<typeof CustomersList>;

/**
 * Sell → Customers on React Query (DEC-259): the same `CustomersList`, its
 * page a query keyed on what the address asks (a search, a chip, the sort,
 * "Bought at", the page and its size). A change rewrites the address in
 * place and the last rows stay, greyed, until the new ones land. Whoever
 * can act on removal requests also reads the open ones, for the tab's
 * count and the banner. Both are read in the browser; the route's loader
 * (`skeleton`) stands until both answer, so the banner doesn't push the
 * list down after it.
 */
export function CustomersContainer({
    defaultSize,
    actions,
    canRemove,
    skeleton,
    ...screen
}: Omit<
    Screen,
    "query" | "page" | "contacts" | "tabs" | "banner" | "pending"
> & {
    /** Rows per page when the address names none (the remembered size). */
    defaultSize: number;
    /** What the API resolved this person may do; null: the API decides. */
    actions: readonly string[] | null;
    /** `customer:remove`: the Requests tab and the banner. */
    canRemove: boolean;
    /** The route's loader, until the first page is read. */
    skeleton: ReactNode;
}) {
    const search = useSearchParams();
    const query = useMemo(
        () =>
            allowedQuery(
                readListQuery(Object.fromEntries(search), defaultSize),
                listMay(actions),
            ),
        [search, defaultSize, actions],
    );
    const list = useCustomersList(customersAsk(query));
    const open = useCustomerRequests({ status: "open" }, canRemove);
    const view = list.data;
    // A storefront that isn't this business's is a 404 from the API: no
    // filter, rather than no page.
    const foreignStore =
        !view &&
        !!query.store &&
        (list.error as { status?: number } | null)?.status === 404;
    useEffect(() => {
        if (foreignStore) {
            window.history.replaceState(
                null,
                "",
                listHref(query, { store: null }),
            );
        }
    }, [foreignStore, query]);

    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (list.isError && !view && !foreignStore) throw list.error;
    if (!view || (canRemove && open.isPending)) return skeleton;
    const openCount = open.data?.rows ? open.data.rows.length : null;

    return (
        <PageContainer width="full">
            <CustomersList
                {...screen}
                query={query}
                page={view.page}
                contacts={view.contacts}
                tabs={
                    canRemove ? (
                        <CustomersTabs
                            active="customers"
                            openRequests={openCount}
                        />
                    ) : null
                }
                banner={
                    canRemove ? <OpenRequestsBanner count={openCount} /> : null
                }
                pending={list.isPlaceholderData}
            />
        </PageContainer>
    );
}
