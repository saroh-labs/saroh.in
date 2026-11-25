"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";

import { listQueryFrom } from "@/lib/invoices/list-view";
import { invoicesAsk } from "@/lib/invoices/queries";
import { chipFromQuery } from "@/lib/invoices/sources";
import {
    useInvoicesList,
    useInvoicesSummary,
} from "@/lib/invoices/use-invoices";
import { sinceParam } from "@/lib/views/since";

import { InvoicesScreen } from "./invoices-screen";

type Screen = ComponentProps<typeof InvoicesScreen>;

/**
 * Payments → Invoices on React Query (DEC-259): the same `InvoicesScreen`,
 * its rows a query keyed on what the address asks the API (a search, a
 * figure, the issued date, a pack or course, `?since=`); the status and the
 * source filter the rows on hand, so picking one reads nothing. A new ask
 * keeps the last rows, greyed, until it lands. The money strip is its own
 * read, so a payment reads both again (`useInvoiceSave`). Both are read in
 * the browser; the route's loader (`skeleton`) stands until both answer,
 * so the strip never says "couldn't be read" while it is on its way.
 */
export function InvoicesContainer({
    skeleton,
    ...screen
}: { skeleton: ReactNode } & Omit<
    Screen,
    | "invoices"
    | "truncated"
    | "query"
    | "initialChip"
    | "scope"
    | "paidSince"
    | "paidSinceInvoices"
    | "summary"
    | "pending"
>) {
    const search = useSearchParams();
    const { params, query, ask } = useMemo(() => {
        const p = Object.fromEntries(search);
        return { params: p, query: listQueryFrom(p), ask: invoicesAsk(p) };
    }, [search]);
    const list = useInvoicesList(ask);
    const summary = useInvoicesSummary();
    const view = list.data;

    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (list.isError && !view) throw list.error;
    if (!view || summary.isPending) return skeleton;

    return (
        <PageContainer width="full">
            <InvoicesScreen
                {...screen}
                invoices={view.invoices}
                truncated={view.truncated}
                query={query}
                initialChip={chipFromQuery(params.source)}
                scope={view.scope}
                // From Home's "Last 24 hours" (F6): the invoices paid since.
                paidSince={sinceParam({ since: ask.since })}
                paidSinceInvoices={view.paid}
                // Null: the strip says it couldn't be read; the list still shows.
                summary={summary.data ?? null}
                pending={list.isPlaceholderData}
            />
        </PageContainer>
    );
}
