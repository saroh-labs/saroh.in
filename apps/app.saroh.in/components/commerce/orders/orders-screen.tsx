"use client";

import { Button } from "@saroh/ui/button";
import { countLabel } from "@saroh/ui/page-header";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import {
    ListPaging,
    ListToolbar,
    MoreFilters,
} from "@/components/shared/list-toolbar";
import { SinceNotice } from "@/components/shared/since-notice";
import { useArrivals } from "@/components/shared/use-arrivals";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type { CustomerPick } from "@/lib/customers/picker";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type {
    OrderFilterOptions,
    OrderListPage,
} from "@/lib/orders/business-service";
import { filtersActive, NO_FILTERS } from "@/lib/orders/list-filters";
import type { OrdersQuery } from "@/lib/orders/list-query";
import { ordersHref, pageHref, pageRange } from "@/lib/orders/list-query";
import { newOrderStores } from "@/lib/orders/new-order-stores";
import type { OrderAbilities } from "@/lib/orders/row-menu";
import type { ShareLink } from "@/lib/sites/share-links";
import type { OrderPlace } from "@/lib/stores/abilities";

import { NewOrderSheet } from "../new-order/new-order-sheet";
import { BulkBar } from "./bulk-bar";
import { OrderExport } from "./order-export";
import {
    moreFiltersOn,
    OrderAttention,
    OrderDateFilter,
    OrderMoreFilters,
} from "./order-filters";
import { OrderFiltersSheet } from "./order-filters-sheet";
import { OrderQuickView } from "./order-quick-view";
import { OrderCard, OrderGridHead, OrderGridRow } from "./order-row";
import { OrderRowMenu } from "./order-row-menu";
import { SearchField } from "./order-search";
import { OrderStatusFilter } from "./order-tabs";
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
 * are. The footer pages by number; Export walks the API's cursor.
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
    notices,
    kitchen = false,
    filterOptions = null,
    share = null,
    can = NO_ABILITIES,
    newOrder = null,
}: {
    /** The page's notices, drawn under its header. */
    notices?: React.ReactNode;
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
     * The first run's share button (DEC-069, L8): the online shop while it
     * is live, else the website; null when nothing is live to share.
     */
    share?: ShareLink | null;
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
        /**
         * The plan takes payment online (`takesOnlinePayment`, R33). When
         * it doesn't, "Send a payment link" isn't offered. Absent: yes.
         */
        online?: boolean;
        /**
         * Why the counter can't take a new order now (UX-036): the plan's
         * monthly orders are used up. The button stays, disabled, with the
         * reason beside it — before anyone fills the sheet in.
         */
        blocked?: string | null;
        /**
         * Who it is for, already chosen (#247): the person page's New
         * order arrives with `?new=1&contactId=`. Null starts it empty.
         */
        initialPick?: CustomerPick | null;
        /**
         * For someone whose business role takes no orders and whose
         * location role does (a location Admin, Manager or Editor): the
         * locations whose own read says they may, and whether their money
         * too. New order is then offered there, in the kitchen's view as
         * well. Absent: the business role decides, at every location.
         */
        places?: readonly OrderPlace[];
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
    // Where New order may be taken: every location for someone the business
    // role lets (never in the kitchen's view), else the ones whose own read
    // says so (`newOrder.places`, a location Admin, Manager or Editor).
    const orderStores = newOrderStores(stores, kitchen, newOrder?.places);
    const [newOpen, setNewOpen] = useState(
        newOrder?.openOnArrival === true &&
            !newOrder.blocked &&
            orderStores.length > 0,
    );
    const peek = rows.find((r) => r.id === peekId) ?? null;
    // Bulk moves (B6): whoever moves kitchen steps; the API decides again.
    const pick = useOrderSelection(rows, ordersHref(query, {}));
    // An order that came in while the list was open (live refresh): it
    // enters, and wears an edge until touched. A change of tab, filter or
    // page is the person's own doing, so nothing in it is new.
    const arrivals = useArrivals(
        rows.map((r) => r.id),
        ordersHref(query, {}),
    );
    const selectable = can.stage;

    const go = useCallback(
        (patch: Partial<OrdersQuery>) =>
            startNavigation(() =>
                router.replace(ordersHref(query, patch), { scroll: false }),
            ),
        [query, router],
    );

    const total = page.counts[query.tab];
    const range = pageRange(query, rows.length, total);
    const firstStore = stores.length === 1 ? stores[0] : undefined;
    // Anything narrowed, a search with words in it included: the toolbar
    // then offers the way back to every order.
    const narrowed =
        filtersActive(query) ||
        query.q.trim() !== "" ||
        query.tab !== "all" ||
        query.storefront !== null;
    // Needs attention couldn't be read for this page (B15): the API sends
    // null rather than an empty list, and the page says so.
    const attentionUnread = rows.some((r) => r.attention === null);

    // One block on the page: the design spaces the tabs, search, filter bar
    // and rows 14px apart, which the page's own 24px rhythm would widen.
    return (
        <div className="min-w-0">
            <OrdersHeading
                count={countLabel(page.counts.all, {
                    one: "order",
                    other: "orders",
                })}
                actions={
                    stores.length > 0 &&
                    (!kitchen || orderStores.length > 0) ? (
                        <>
                            {/* A file of every order leaves Saroh: its own
                                power (`order:export`, B16). */}
                            {can.export ? (
                                <OrderExport
                                    query={query}
                                    total={page.counts[query.tab]}
                                    storeName={store?.name}
                                />
                            ) : null}
                            {newOrder && orderStores.length > 0 ? (
                                <>
                                    {newOrder.blocked ? (
                                        <span
                                            id="new-order-blocked"
                                            className="max-w-[260px] text-pretty text-[12px] leading-snug text-muted-foreground"
                                        >
                                            {newOrder.blocked}
                                        </span>
                                    ) : null}
                                    <Button
                                        type="button"
                                        onClick={() => setNewOpen(true)}
                                        disabled={!!newOrder.blocked}
                                        aria-describedby={
                                            newOrder.blocked
                                                ? "new-order-blocked"
                                                : undefined
                                        }
                                        className="cursor-pointer active:scale-[0.98]"
                                    >
                                        New order
                                    </Button>
                                </>
                            ) : null}
                        </>
                    ) : undefined
                }
            />

            {/* A notice about the page sits under its header, never above
                the title. */}
            {notices}

            {/* The one list toolbar, in one row: search, the three most
                used filters, one Filters button for the rest, the one
                attention toggle, Clear filters, and the range. */}
            <ListToolbar
                search={
                    <SearchField query={query} go={go} searching={navigating} />
                }
                // The three most used: the status, the date, the location.
                filters={
                    <>
                        <OrderStatusFilter
                            query={query}
                            counts={page.counts}
                            go={go}
                        />
                        {/* The desk's; a phone has the date in the sheet. */}
                        <div className="max-[759px]:hidden min-[760px]:contents">
                            <OrderDateFilter query={query} go={go} />
                        </div>
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
                                noun={{
                                    one: "open order",
                                    other: "open orders",
                                }}
                                note={`A filter, not a scope. The order book belongs to ${businessName}, and this narrows it to one location.`}
                            />
                        ) : null}
                    </>
                }
                // Every other filter is behind one Filters button: a
                // popover at the desk, the sheet on a phone.
                more={
                    <>
                        <OrderFiltersSheet
                            query={query}
                            options={filterOptions}
                            go={go}
                            className="min-[760px]:hidden"
                        />
                        <MoreFilters
                            title="Filter orders"
                            count={moreFiltersOn(query)}
                            className="max-[759px]:hidden"
                        >
                            <div
                                role="group"
                                aria-label="Filter orders"
                                className="grid gap-2.5"
                            >
                                <OrderMoreFilters
                                    query={query}
                                    options={filterOptions}
                                    go={go}
                                />
                            </div>
                        </MoreFilters>
                    </>
                }
                attention={
                    <OrderAttention
                        query={query}
                        go={go}
                        className="max-[759px]:hidden"
                    />
                }
                onClear={
                    narrowed
                        ? () =>
                              go({
                                  ...NO_FILTERS,
                                  q: "",
                                  tab: "all",
                                  storefront: null,
                              })
                        : undefined
                }
                count={range ? `Showing ${range}` : null}
            />

            {/* From Home's "Last 24 hours" (F6): the list is narrowed, and
                says so, with the whole list one click away. The count is the
                API's for the status in view. */}
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
                        share={share}
                        onNew={
                            newOrder &&
                            !newOrder.blocked &&
                            orderStores.length > 0
                                ? () => setNewOpen(true)
                                : undefined
                        }
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
                                        arrived={arrivals.isNew(row.id)}
                                        onTouch={() => arrivals.touch(row.id)}
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
                                    arrived={arrivals.isNew(row.id)}
                                    onTouch={() => arrivals.touch(row.id)}
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

            {newOrder && orderStores.length > 0 ? (
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
                    stores={orderStores}
                    // The storefront in view, else the first.
                    initialStoreId={
                        orderStores.find((s) => s.id === store?.id)?.id ??
                        orderStores[0].id
                    }
                    noMoneyAt={newOrder.places
                        ?.filter((p) => !p.money)
                        .map((p) => p.id)}
                    // A new order's payment link is `order:create`'s (B16).
                    canLink={can.create}
                    online={newOrder.online ?? true}
                    canSearch={newOrder.canSearch}
                    initialPick={newOrder.initialPick ?? null}
                />
            ) : null}

            <ListPaging
                label="Pages of orders"
                page={query.page}
                total={total}
                size={query.size}
                to={(n) => ({ href: pageHref(query, n) })}
                onSize={(size) => {
                    rememberPageSize("orders", size);
                    go({ size });
                }}
            />
        </div>
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
