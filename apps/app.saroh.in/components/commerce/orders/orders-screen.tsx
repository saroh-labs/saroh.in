"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { SinceNotice } from "@/components/shared/since-notice";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type {
    OrderFilterOptions,
    OrderListPage,
} from "@/lib/orders/business-service";
import { newOrderHref } from "@/lib/orders/links";
import type { OrdersQuery } from "@/lib/orders/list-query";
import {
    nextPageHref,
    ordersHref,
    pageRange,
    previousPageHref,
} from "@/lib/orders/list-query";
import type { OrderAbilities } from "@/lib/orders/row-menu";

import { OrderExport } from "./order-export";
import { OrderFilters } from "./order-filters";
import { OrderQuickView } from "./order-quick-view";
import { OrderCard, OrderGridHead, OrderGridRow } from "./order-row";
import { OrderRowMenu } from "./order-row-menu";
import { OrderTabs } from "./order-tabs";
import { OrdersEmpty, OrdersHeading } from "./orders-states";

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
 * `order-quick-view.tsx`, `order-row-menu.tsx`); on a phone the card opens
 * the order, as the design draws it. Bulk moves are B6. Loading, failed,
 * locked and every empty list are in `orders-states.tsx` (B7).
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
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    const many = stores.length > 1;
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const rows = page.rows;
    const money = !kitchen && rows.some((r) => r.total !== undefined);
    // The row whose quick view is open (B5).
    const [peekId, setPeekId] = useState<string | null>(null);
    const peek = rows.find((r) => r.id === peekId) ?? null;

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

    return (
        <>
            <OrdersHeading
                actions={
                    stores.length > 0 && !kitchen ? (
                        <>
                            <Button asChild>
                                {/* Into the storefront in view, or — with several
                                and none chosen — a page that asks which. */}
                                <Link
                                    href={newOrderHref(
                                        store?.id ?? firstStore?.id,
                                    )}
                                >
                                    <Plus className="mr-1.5 size-4" />
                                    New order
                                </Link>
                            </Button>
                            <OrderExport
                                query={query}
                                total={page.counts[query.tab]}
                                storeName={store?.name}
                            />
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

            <OrderFilters query={query} options={filterOptions} go={go} />

            <div aria-busy={navigating} className="pt-3.5">
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
                            <OrderGridHead money={money} />
                            <ul aria-label="Orders">
                                {rows.map((row) => (
                                    <OrderGridRow
                                        key={row.id}
                                        row={row}
                                        showStore={many && !store}
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
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <OrderQuickView
                row={peek}
                can={can}
                onOpenChange={(open) => {
                    if (!open) setPeekId(null);
                }}
            />

            {previous || next ? (
                <nav
                    aria-label="Pages of orders"
                    className="flex flex-wrap items-center justify-end gap-2 pt-3.5"
                >
                    <PageLink href={previous} label="Previous" />
                    <PageLink href={next} label="Next" />
                </nav>
            ) : null}
        </>
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

/**
 * Search by order number or customer name (and email or phone for a role
 * that reads contacts — the API decides). It covers every order, not the
 * page on screen, so it goes into the address after a pause in typing.
 */
function SearchField({
    query,
    go,
}: {
    query: OrdersQuery;
    go: (patch: Partial<OrdersQuery>) => void;
}) {
    const [text, setText] = useState(query.q);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const field = useRef<HTMLInputElement | null>(null);
    // The address changed elsewhere (Clear search, the back button): say so
    // — but never over what someone is still typing.
    useEffect(() => {
        if (document.activeElement !== field.current) setText(query.q);
    }, [query.q]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    function search(value: string) {
        setText(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => go({ q: value.trim() }), 300);
    }

    return (
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
            <Search
                aria-hidden
                className="pointer-events-none absolute left-[11px] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
                ref={field}
                type="search"
                value={text}
                onChange={(e) => search(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && text) {
                        e.preventDefault();
                        search("");
                    }
                }}
                placeholder="Search orders"
                aria-label="Search orders"
                className="h-[38px] pl-[34px] text-[13.5px] coarse:h-11"
            />
        </div>
    );
}

/** Before the page says: nothing beyond opening the order. */
const NO_ABILITIES: OrderAbilities = {
    stage: false,
    write: false,
    refund: false,
    payOnline: false,
};
