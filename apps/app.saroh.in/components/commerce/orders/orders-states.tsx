"use client";

import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, Receipt, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { OrdersQuery } from "@/lib/orders/list-query";
import { ORDERS_TABS, ordersEmptyCopy } from "@/lib/orders/list-query";

import { ORDER_GRID } from "./order-row";

/**
 * Every state the Orders list and Order Detail draw besides their rows, after
 * the designs' Data state tweak (plan B, B7). Each is one of the named
 * states (`@saroh/ui/data-state`), so they differ by shape, icon, wording and
 * semantics, never by colour alone:
 *
 * - loading: the list's own shape, the rows swept, no counts;
 * - empty: per tab, per search and per `?since=` — only a business with no
 *   orders says "No orders yet";
 * - failed: "Couldn't load orders" with Try again, and never an empty list;
 * - locked: for someone holding neither `order:read` nor `order:stage`, why
 *   and who can change it, rather than a hidden screen.
 *
 * The partial state (Needs attention couldn't be read) arrives with B15.
 */

/** The page's heading, which every state keeps so no one wonders where they are. */
export function OrdersHeading({ actions }: { actions?: ReactNode }) {
    return (
        <PageHeader
            breadcrumb={["Sell", "Orders"]}
            title="Orders"
            className="mb-3"
            actions={actions}
        />
    );
}

/**
 * The rows while they arrive: the design's grid at the desk (a head bar,
 * then an avatar and two lines, the status, when and the total), cards on a
 * phone. Only the first line of each row sweeps; the rest wait still.
 */
export function OrdersLoadingRows({ rows = 4 }: { rows?: number }) {
    const each = Array.from({ length: rows }, (_, i) => i);
    return (
        <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading orders</span>
            <div
                aria-hidden
                className="overflow-hidden rounded-[11px] border border-border bg-card max-[759px]:hidden"
            >
                <div className="h-10 border-b border-border bg-muted" />
                {each.map((i) => (
                    <div
                        key={i}
                        className={cn(
                            ORDER_GRID,
                            "border-b border-border py-[11px] last:border-b-0",
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-[11px] pr-3.5">
                            <Skeleton className="size-[30px] flex-none rounded-full" />
                            <div className="min-w-0 flex-1">
                                <Skeleton className="h-2.5 w-[68%] rounded-[4px]" />
                                <div className="mt-1.5 h-2.5 w-[40%] rounded-[4px] bg-muted/70" />
                            </div>
                        </div>
                        <div className="h-2.5 w-[62px] rounded-[4px] bg-muted/70" />
                        <div className="h-2.5 w-[74px] rounded-[4px] bg-muted/70" />
                        <div className="flex justify-end">
                            <div className="h-2.5 w-[54px] rounded-[4px] bg-muted/70" />
                        </div>
                    </div>
                ))}
            </div>
            <div aria-hidden className="flex flex-col gap-2 min-[760px]:hidden">
                {each.map((i) => (
                    <div
                        key={i}
                        className="flex flex-col gap-2 rounded-[11px] border border-border bg-card p-3"
                    >
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-3 w-[55%] rounded-[4px]" />
                            <div className="ml-auto h-3 w-14 rounded-[4px] bg-muted/70" />
                        </div>
                        <div className="h-2.5 w-[70%] rounded-[4px] bg-muted/70" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * The whole page while it loads: the heading, the tabs without their counts
 * (an unknown count is left out, never shown as 0), the search, the rows.
 */
export function OrdersLoading() {
    return (
        <>
            <OrdersHeading />
            <div
                aria-hidden
                className="flex flex-wrap gap-0.5 border-b border-border"
            >
                {ORDERS_TABS.map((tab) => (
                    <span
                        key={tab.id}
                        className="px-[13px] py-[9px] text-[13.5px] font-medium text-muted-foreground"
                    >
                        {tab.label}
                    </span>
                ))}
            </div>
            <div aria-hidden className="pt-3.5">
                <Skeleton className="h-[38px] w-full max-w-[320px] rounded-[9px] coarse:h-11" />
            </div>
            <div className="pt-3.5">
                <OrdersLoadingRows />
            </div>
        </>
    );
}

/**
 * The list couldn't be read. It replaces the page's body — no tabs, counts,
 * search or actions around it, since none of them would be true — and says
 * that nothing was lost or changed. `reference` is the digest support asks
 * for, when there is one.
 */
export function OrdersFailed({
    onRetry,
    reference,
}: {
    onRetry: () => void;
    reference?: string | null;
}) {
    return (
        <>
            <OrdersHeading />
            <FailedState
                className="my-6"
                title="Couldn't load orders"
                description="Something went wrong on our side, so this is not the whole picture. Orders that were placed are still there and nothing has been changed — this screen simply could not read them."
                action={
                    <div className="mt-1.5 flex flex-col items-center gap-3">
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button onClick={onRetry} className="wk-press">
                                Try again
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                className="wk-press"
                            >
                                <Link href="/">Back to Home</Link>
                            </Button>
                        </div>
                        {reference ? (
                            <p className="font-mono text-xs text-muted-foreground">
                                Reference: {reference}
                            </p>
                        ) : null}
                    </div>
                }
            />
        </>
    );
}

/**
 * Someone holding neither `order:read` nor `order:stage`: the design's
 * locked card under the page's own heading. It explains and says who can
 * change it; there is nothing to retry.
 */
export function OrdersLocked({
    description,
    note,
}: {
    description: string;
    note: string;
}) {
    return (
        <>
            <OrdersHeading />
            <PermissionDeniedState
                className="rounded-[11px] border-border-strong"
                description={description}
                note={note}
            />
        </>
    );
}

/**
 * Order Detail's locked card: the design's "You can't open orders", with the
 * way back. Nothing of the order is read for it.
 */
export function OrderLocked({ text }: { text: string }) {
    return (
        <div className="px-4 py-[60px] sm:px-[22px]">
            <PermissionDeniedState
                className="gap-[9px] border-border-strong py-9 sm:py-9"
                title="You can't open orders"
                description={text}
                action={
                    <Button asChild variant="outline" className="wk-press mt-1">
                        <Link href="/">Back to Home</Link>
                    </Button>
                }
            />
        </div>
    );
}

/**
 * An empty list, said for what emptied it (`ordersEmptyCopy`): the search,
 * the tab, `?since=`, or a business with no orders yet — each with the one
 * thing that fills it. Only the last says "No orders yet".
 */
export function OrdersEmpty({
    query,
    storeName,
    go,
    shareUrl = null,
}: {
    query: OrdersQuery;
    storeName: string | null;
    go: (patch: Partial<OrdersQuery>) => void;
    /**
     * The live site's address: a business with no orders yet is offered
     * "Share your storefront", which copies it. Null: no live site, so no
     * button — there is nothing to share yet.
     */
    shareUrl?: string | null;
}) {
    const copy = ordersEmptyCopy(query, storeName);
    const share = copy.kind === "first-run" && shareUrl ? shareUrl : null;
    const copyLink = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            showSuccess("Storefront link copied", url);
        } catch {
            showError(
                "Couldn't copy the link. Select it and copy it instead.",
                url,
            );
        }
    };
    const Icon =
        copy.kind === "search"
            ? Search
            : query.tab === "open"
              ? Check
              : query.tab === "refunded"
                ? RotateCcw
                : Receipt;
    const action =
        copy.action === "clear-search"
            ? { label: "Clear search", patch: { q: "" } }
            : copy.action === "clear-since"
              ? { label: "Show all orders", patch: { since: null } }
              : copy.action === "show-all"
                ? { label: "View all orders", patch: { tab: "all" as const } }
                : null;
    return (
        <EmptyState
            className="gap-[9px] rounded-[11px] border-border-strong"
            icon={<Icon />}
            title={copy.title}
            description={copy.note}
            action={
                action ? (
                    <Button
                        variant="outline"
                        className="mt-1"
                        onClick={() => go(action.patch)}
                    >
                        {action.label}
                    </Button>
                ) : share ? (
                    <Button
                        variant="outline"
                        className="mt-1"
                        onClick={() => void copyLink(share)}
                    >
                        Share your storefront
                    </Button>
                ) : undefined
            }
        />
    );
}
