"use client";

import { Button } from "@saroh/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { SinceNotice } from "@/components/shared/since-notice";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type {
    OrderFilterOptions,
    OrderListPage,
} from "@/lib/orders/business-service";
import type { OrdersQuery } from "@/lib/orders/list-query";
import {
    nextPageHref,
    ordersHref,
    pageRange,
    previousPageHref,
} from "@/lib/orders/list-query";
import type { OrderAbilities } from "@/lib/orders/row-menu";

import { NewOrderSheet } from "../new-order/new-order-sheet";
import { BulkBar } from "./bulk-bar";
import { OrderExport } from "./order-export";
import { OrderFilters } from "./order-filters";
import { OrderFiltersSheet } from "./order-filters-sheet";
import { OrderQuickView } from "./order-quick-view";
import { OrderCard, OrderGridHead, OrderGridRow } from "./order-row";
import { OrderRowMenu } from "./order-row-menu";
import { SearchField } from "./order-search";
import { OrderTabs } from "./order-tabs";
import {
    OrdersAttentionPartial,
    OrdersEmpty,
    OrdersHeading,
} from "./orders-states";
import { useOrderSelection } from "./use-order-selection";

/**
 * Sell → Orders, after the "Saroh Orders Screen" design (plan B, B3): every
 * order in the business, newest first, a page at a time.
 *
 * The API does the narrowing: the tab, the search, the storefront and the
 * filters (B4, `order-filters.tsx`) live in the address, the server asks for
 * one page of them, and the tab counts come back with it — so the counts,
 * the rows and the rail's badge are the same fact however many orders there
 * are. Previous and Next follow the API's cursor, and so does Export.
 *
 * The storefront control is a FILTER, not a scope: orders belong to the
 * business. At the desk a row opens its quick view and has a row menu (B5,
 * `order-quick-view.tsx`, `order-row-menu.tsx`). On a phone (DEC-067, a
 * recorded deviation from the design) a card opens the same quick view as
 * a sheet from the bottom, and the filters sit behind a Filters button
 * (`order-filters-sheet.tsx`) rather than stacked above the first order.
 * With `order:stage`, rows can be selected and moved a step together, or
 * their tickets printed (B6, `bulk-bar.tsx`). Loading, failed, locked and
 * every empty list are in `orders-states.tsx` (B7).
 */
export function OrdersScreen({
    query,
    page,
    stores,
    openByStore,
    businessName,
    kitchen = false,
    filterOptions = null,
    shareUrl = null,
    can = NO_ABILITIES,
    newOrder = null,
}: {
    query: OrdersQuery;
    /** The page on screen, read on the server. */
    page: OrderListPage;
    /**
     * What the filter bar offers (B4); null when it couldn't be read, and
     * the bar leaves out the menus it would fill.
     */
    filterOptions?: OrderFilterOptions | null;
    stores: { id: string; name: string }[];
    /**
     * Open orders per storefront, for the storefront menu; null when they
     * couldn't be counted (the menu then leaves the counts out).
     */
    openByStore: Record<string, number> | null;
    /** For the storefront menu's note: whose order book it is. */
    businessName: string;
    /**
     * The kitchen's view (a Member, through `order:stage`): no totals, no
     * export and no New order — the API sends no money, and taking an order
     * is not theirs to do.
     */
    kitchen?: boolean;
    /**
     * The live site's address, for the first-run "Share your storefront"
     * (B7, built in B8); null when there is none to share.
     */
    shareUrl?: string | null;
    /**
     * What the caller may do from a row (B5): its menu and quick view draw
     * only what they can use. The API decides again on every write.
     */
    can?: OrderAbilities;
    /**
     * New order (B13): whether the sheet opens on arrival (`?new=1`, where
     * the old New order page and the calendar send people) and what the
     * viewer may do in it. Null when the business sells nothing a counter
     * takes — its appointments are booked in Bookings.
     */
    newOrder?: {
        openOnArrival: boolean;
        /** `contact:read`: search customers, and read their notes. */
        canSearch: boolean;
    } | null;
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    // A phone's quick view rises from the bottom (B5).
    const narrow = useNarrow();
    const many = stores.length > 1;
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const rows = page.rows;
    const money = !kitchen && rows.some((r) => r.total !== undefined);
    // The row whose quick view is open (B5).
    const [peekId, setPeekId] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(
        newOrder?.openOnArrival === true && stores.length > 0 && !kitchen,
    );
    const peek = rows.find((r) => r.id === peekId) ?? null;
    // Bulk moves (B6): whoever moves kitchen steps; the API decides again.
    const pick = useOrderSelection(rows, ordersHref(query, {}));
    const selectable = can.stage;

    const go = useCallback(
        (patch: Partial<OrdersQuery>) =>
            startNavigation(() =>
                router.replace(ordersHref(query, patch), { scroll: false }),
            ),
        [query, router],
    );

    const previous = previousPageHref(query);
    const next = page.nextCursor ? nextPageHref(query, page.nextCursor) : null;
    const range = pageRange(
        query,
        rows.length,
        page.counts[query.tab],
        !!page.nextCursor,
    );
    const firstStore = stores.length === 1 ? stores[0] : undefined;
    // Needs attention couldn't be read for this page (B15): the API sends
    // null rather than an empty list, and the page says so.
    const attentionUnread = rows.some((r) => r.attention === null);

    // One block on the page: the design spaces the tabs, search, filter bar
    // and rows 14px apart, which the page's own 24px rhythm would widen.
    return (
        <div className="min-w-0">
            <OrdersHeading
                actions={
                    stores.length > 0 && !kitchen ? (
                        <>
                            {newOrder ? (
                                <Button
                                    type="button"
                                    onClick={() => setNewOpen(true)}
                                    className="cursor-pointer active:scale-[0.98]"
                                >
                                    <Plus className="mr-1.5 size-4" />
                                    New order
                                </Button>
                            ) : null}
                            {/* A file of every order leaves Saroh: its own
                                power (`order:export`, B16). */}
                            {can.export ? (
                                <OrderExport
                                    query={query}
                                    total={page.counts[query.tab]}
                                    storeName={store?.name}
                                />
                            ) : null}
                        </>
                    ) : undefined
                }
            />

            <OrderTabs query={query} counts={page.counts} />

            {/* From Home's "Last 24 hours" (F6): the list is narrowed, and
                says so, with the whole list one click away. The count is the
                API's for the tab in view. */}
            {query.since ? (
                <div className="pt-3.5">
                    <SinceNotice
                        count={page.counts[query.tab]}
                        noun={{ one: "order", other: "orders" }}
                        verb="placed"
                        clearHref={ordersHref(query, { since: null })}
                    />
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5 pt-3.5">
                <SearchField query={query} go={go} />
                {/* A phone: the filters are behind one button (B5). */}
                <OrderFiltersSheet
                    query={query}
                    options={filterOptions}
                    go={go}
                    className="min-[760px]:hidden"
                />
                {many ? (
                    <StorefrontFilter
                        stores={stores}
                        countFor={(id) => openByStore?.[id] ?? null}
                        total={
                            openByStore
                                ? Object.values(openByStore).reduce(
                                      (n, c) => n + c,
                                      0,
                                  )
                                : null
                        }
                        value={query.storefront}
                        onChange={(storefront) => go({ storefront })}
                        noun={{ one: "open order", other: "open orders" }}
                        label="Show orders taken at"
                        note={`A filter, not a scope. The order book belongs to ${businessName}; this narrows it to one storefront.`}
                    />
                ) : null}
                {range ? (
                    <div className="ml-auto text-[12px] text-muted-foreground">
                        Showing {range}
                    </div>
                ) : null}
            </div>

            {/* The desk: the filter bar, on the page. */}
            <div className="max-[759px]:hidden">
                <OrderFilters query={query} options={filterOptions} go={go} />
            </div>

            <div aria-busy={navigating} className="pt-3.5">
                {attentionUnread ? (
                    <OrdersAttentionPartial
                        onRetry={() => startNavigation(() => router.refresh())}
                    />
                ) : null}
                {rows.length === 0 ? (
                    <OrdersEmpty
                        query={query}
                        storeName={store?.name ?? firstStore?.name ?? null}
                        options={filterOptions}
                        go={go}
                        shareUrl={shareUrl}
                    />
                ) : (
                    <>
                        {/* The desk: one grid, heads over rows. */}
                        <div className="rounded-[11px] border border-border bg-card max-[759px]:hidden">
                            <OrderGridHead
                                money={money}
                                select={selectable ? pick.head : undefined}
                            />
                            <ul aria-label="Orders">
                                {rows.map((row) => (
                                    <OrderGridRow
                                        key={row.id}
                                        row={row}
                                        showStore={many && !store}
                                        select={
                                            selectable
                                                ? pick.row(row)
                                                : undefined
                                        }
                                        open={row.id === peekId}
                                        onOpen={() => setPeekId(row.id)}
                                        menu={
                                            <OrderRowMenu row={row} can={can} />
                                        }
                                    />
                                ))}
                            </ul>
                        </div>
                        {/* A phone: the rows stack into cards. */}
                        <ul
                            aria-label="Orders"
                            className="flex flex-col gap-2 min-[760px]:hidden"
                        >
                            {rows.map((row) => (
                                <OrderCard
                                    key={row.id}
                                    row={row}
                                    showStore={many && !store}
                                    select={
                                        selectable ? pick.row(row) : undefined
                                    }
                                    open={row.id === peekId}
                                    onOpen={() => setPeekId(row.id)}
                                />
                            ))}
                        </ul>
                    </>
                )}
                {selectable ? (
                    <BulkBar selected={pick.selected} onClear={pick.clear} />
                ) : null}
            </div>

            <OrderQuickView
                row={peek}
                can={can}
                side={narrow ? "bottom" : "right"}
                onOpenChange={(open) => {
                    if (!open) setPeekId(null);
                }}
            />

            {newOrder && stores.length > 0 && !kitchen ? (
                <NewOrderSheet
                    open={newOpen}
                    onOpenChange={(open) => {
                        setNewOpen(open);
                        // Opened by ?new=1: closing it leaves the list's
                        // own address, so a reload doesn't open it again.
                        if (!open && newOrder.openOnArrival) {
                            router.replace(ordersHref(query, {}), {
                                scroll: false,
                            });
                        }
                    }}
                    stores={stores}
                    // The storefront in view, else the first.
                    initialStoreId={store?.id ?? stores[0].id}
                    // A new order's pay link is `order:create`'s (B16).
                    canLink={can.create}
                    canSearch={newOrder.canSearch}
                />
            ) : null}

            {previous || next ? (
                <nav
                    aria-label="Pages of orders"
                    className="flex flex-wrap items-center justify-end gap-2 pt-3.5"
                >
                    <PageLink href={previous} label="Previous" />
                    <PageLink href={next} label="Next" />
                </nav>
            ) : null}
        </div>
    );
}

/** Previous or Next: a link while there is a page there, else off. */
function PageLink({ href, label }: { href: string | null; label: string }) {
    if (!href) {
        return (
            <Button variant="outline" disabled>
                {label}
            </Button>
        );
    }
    return (
        <Button variant="outline" asChild>
            <Link href={href} scroll={false}>
                {label}
            </Link>
        </Button>
    );
}

/** Before the page says: nothing beyond opening the order. */
const NO_ABILITIES: OrderAbilities = {
    stage: false,
    create: false,
    payLink: false,
    refund: false,
    export: false,
    payOnline: false,
};
