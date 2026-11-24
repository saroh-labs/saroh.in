"use client";

import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { useMemo } from "react";

import { CustomersTabs } from "@/components/customers/data-requests/customers-tabs";
import { OpenRequestsBanner } from "@/components/customers/data-requests/open-requests-banner";
import { allowedQuery, listMay, readListQuery } from "@/lib/customers/list";
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
 * count and the banner.
 */
export function CustomersContainer({
    defaultSize,
    actions,
    canRemove,
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

    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (list.isError && !view) throw list.error;
    if (!view) return null;
    const openCount = open.data?.rows ? open.data.rows.length : null;

    return (
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
            banner={canRemove ? <OpenRequestsBanner count={openCount} /> : null}
            pending={list.isPlaceholderData}
        />
    );
}
