"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { PageHeader } from "@saroh/ui/page-header";
import { showError } from "@saroh/ui/toast";
import { Check, Plus, Receipt, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { SinceNotice } from "@/components/shared/since-notice";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type { OrderListPage, OrderRow } from "@/lib/orders/business-service";
import { ordersToCsv } from "@/lib/orders/export";
import { newOrderHref } from "@/lib/orders/links";
import { loadOrdersForExport } from "@/lib/orders/list-actions";
import type { OrdersQuery } from "@/lib/orders/list-query";
import {
    nextPageHref,
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    pageRange,
    previousPageHref,
} from "@/lib/orders/list-query";

import { OrderCard, OrderGridHead, OrderGridRow } from "./order-row";
import { OrderTabs } from "./order-tabs";

/**
 * Sell → Orders, after the "Saroh Orders Screen" design (plan B, B3): every
 * order in the business, newest first, a page at a time.
 *
 * The API does the narrowing: the tab, the search and the storefront live in
 * the address, the server asks for one page of them, and the tab counts come
 * back with it — so the counts, the rows and the rail's badge are the same
 * fact however many orders there are. Previous and Next follow the API's
 * cursor.
 *
 * The storefront control is a FILTER, not a scope: orders belong to the
 * business. Filters, the quick view, the row menu and bulk moves are later
 * units (B4, B5, B6); the states beyond empty are B7's.
 */
export function OrdersScreen({
    query,
    page,
    stores,
    openByStore,
    businessName,
    kitchen = false,
}: {
    query: OrdersQuery;
    /** The page on screen, read on the server. */
    page: OrderListPage;
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
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    const many = stores.length > 1;
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const rows = page.rows;
    const money = !kitchen && rows.some((r) => r.total !== undefined);

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
            <PageHeader
                breadcrumb={["Sell", "Orders"]}
                title="Orders"
                className="mb-3"
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
                            <ExportButton
                                query={query}
                                disabled={page.counts.all === 0}
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

            <div aria-busy={navigating} className="pt-3.5">
                {rows.length === 0 ? (
                    <EmptyOrders
                        query={query}
                        storeName={store?.name ?? firstStore?.name ?? null}
                        go={go}
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

/**
 * The design's empty states: the search, the tab, or a business with no
 * orders yet — each with the one thing that fills it.
 */
function EmptyOrders({
    query,
    storeName,
    go,
}: {
    query: OrdersQuery;
    storeName: string | null;
    go: (patch: Partial<OrdersQuery>) => void;
}) {
    const copy = ordersEmptyCopy(query, storeName);
    const Icon =
        copy.kind === "search"
            ? Search
            : query.tab === "open"
              ? Check
              : query.tab === "refunded"
                ? RotateCcw
                : Receipt;
    return (
        <div className="flex flex-col items-center gap-[9px] rounded-[11px] border border-dashed border-border-strong px-6 py-12 text-center">
            <Icon
                aria-hidden
                className="size-[30px] stroke-[1.8] text-muted-foreground"
            />
            <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                {copy.title}
            </p>
            <p className="max-w-[44ch] text-[13.5px] leading-[1.55] text-muted-foreground">
                {copy.note}
            </p>
            {copy.action === "clear-search" ? (
                <Button
                    variant="outline"
                    className="mt-1"
                    onClick={() => go({ q: "" })}
                >
                    Clear search
                </Button>
            ) : copy.action === "clear-since" ? (
                <Button
                    variant="outline"
                    className="mt-1"
                    onClick={() => go({ since: null })}
                >
                    Show all orders
                </Button>
            ) : copy.action === "show-all" ? (
                <Button
                    variant="outline"
                    className="mt-1"
                    onClick={() => go({ tab: "all" })}
                >
                    View all orders
                </Button>
            ) : null}
        </div>
    );
}

/**
 * Export: every order the list is narrowed to — the tab, the search and the
 * storefront, not only the page on screen — as a CSV built in the browser.
 */
function ExportButton({
    query,
    disabled,
    storeName,
}: {
    query: OrdersQuery;
    disabled: boolean;
    storeName?: string;
}) {
    const [busy, setBusy] = useState(false);
    async function run() {
        setBusy(true);
        const res = await loadOrdersForExport(
            orderListParams({ ...query, cursor: null, back: [] }),
        );
        setBusy(false);
        if (!res.ok) {
            showError("Nothing was exported.", res.error);
            return;
        }
        downloadCsv(res.data.rows, storeName);
        if (!res.data.complete) {
            showError(
                `Only the newest ${res.data.rows.length} orders were exported.`,
                "Narrow the list, by storefront or search, to export the rest.",
            );
        }
    }
    return (
        <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void run()}
        >
            {busy ? "Exporting…" : "Export"}
        </Button>
    );
}

/**
 * Hand the orders to the browser as a CSV file. Named for the storefront
 * when the list is filtered to one, and dated, so a folder of exports sorts
 * itself.
 */
function downloadCsv(rows: OrderRow[], storeName?: string) {
    // A byte-order mark, so Excel reads ₹ and names in the right encoding.
    const blob = new Blob(["﻿", ordersToCsv(rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    const scope = storeName
        ? `-${storeName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}`
        : "";
    a.href = url;
    a.download = `orders${scope}-${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
