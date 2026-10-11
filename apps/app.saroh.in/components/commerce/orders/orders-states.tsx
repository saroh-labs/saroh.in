"use client";

import { PartialRead } from "@/components/shared/failed-read";
import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { backTo, couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";

import { Check, ListFilter, Receipt, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ShareLinkButton } from "@/components/sites/share-link-button";
import type { OrderFilterOptions } from "@/lib/orders/business-service";
import { NO_FILTERS } from "@/lib/orders/list-filters";
import type { OrdersQuery } from "@/lib/orders/list-query";
import { ordersEmptyCopy } from "@/lib/orders/list-query";
import type { ShareLink } from "@/lib/sites/share-links";

/**
 * Every state the Orders list and Order Detail draw besides their rows, after
 * the designs' Data state tweak (plan B, B7). Each is one of the named
 * states (`@saroh/ui/data-state`), so they differ by shape, icon, wording and
 * semantics, never by colour alone:
 *
 * - loading: the list's own shape, the rows swept, no counts;
 * - empty: per tab, per search, per filter (B4) and per `?since=` — only a
 *   business with no orders says "No orders yet";
 * - failed: "Couldn't load orders" with Try again, and never an empty list;
 * - locked: for someone holding neither `order:read` nor `order:stage`, why
 *   and who can change it, rather than a hidden screen;
 * - partial: Needs attention couldn't be read (B15), so each row's tag says
 *   "Not available" — never no tag, which would read as "nothing to know".
 */

/** The page's heading, which every state keeps so no one wonders where they are. */
export function OrdersHeading({
    actions,
    count,
}: {
    actions?: ReactNode;
    /** "12 orders", every order the business has; nothing at none. */
    count?: string;
}) {
    return (
        <PageHeader
            breadcrumb={["Sell", "Orders"]}
            title="Orders"
            count={count}
            className="mb-3"
            actions={actions}
        />
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
                title={couldntLoad("orders")}
                description={nothingChanged(
                    "Orders that were placed are still there.",
                )}
                onRetry={onRetry}
                reference={reference}
                action={
                    <Button asChild variant="ghost" className="wk-press">
                        <Link href="/">{backTo("Home")}</Link>
                    </Button>
                }
            />
        </>
    );
}

/**
 * The partial state (B15): the orders arrived, but their customers' Needs
 * attention couldn't be read. A banner above the rows, in the design's
 * partial treatment, says what is missing and that the rows are still
 * whole; each row's tag reads "Not available".
 */
export function OrdersAttentionPartial({ onRetry }: { onRetry: () => void }) {
    return (
        <PartialRead
            className="mb-3.5"
            things="what needs attention"
            so="Allergies and other notes show as “Not available”. The orders below arrived normally. Check with the customer before an order goes out."
            onRetry={onRetry}
        />
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
                title="You can't open Orders"
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
                title="You can't open Orders"
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
    options = null,
    go,
    share = null,
    onNew,
}: {
    query: OrdersQuery;
    storeName: string | null;
    /** The filter bar's words, to say which filters found nothing (B4). */
    options?: OrderFilterOptions | null;
    go: (patch: Partial<OrdersQuery>) => void;
    /**
     * What a business with no orders yet is offered to share (DEC-069, L8):
     * "Share your online shop" while `/shop` is live, else "Share your
     * website" (`ORDERS_FIRST_RUN`). Null: nothing is live, so no button —
     * there is nothing to share yet.
     */
    share?: ShareLink | null;
    /**
     * Opens New order, for someone who may take one: the header's own
     * action, under the same label. Left out for anyone else, and the
     * sentence promises nothing.
     */
    onNew?: () => void;
}) {
    const copy = ordersEmptyCopy(query, storeName, options);
    const offer = copy.kind === "first-run" ? share : null;
    const Icon =
        copy.kind === "search"
            ? Search
            : copy.kind === "filter"
              ? ListFilter
              : query.tab === "open"
                ? Check
                : query.tab === "refunded"
                  ? RotateCcw
                  : Receipt;
    const action: {
        label: string;
        patch: Partial<OrdersQuery>;
    } | null =
        copy.action === "clear-search"
            ? { label: "Clear search", patch: { q: "" } }
            : copy.action === "clear-filters"
              ? { label: "Clear filters", patch: { ...NO_FILTERS } }
              : copy.action === "clear-since"
                ? { label: "Show all orders", patch: { since: null } }
                : copy.action === "show-all"
                  ? { label: "Show all orders", patch: { tab: "all" as const } }
                  : null;
    return (
        <EmptyState
            data-ph-mask=""
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
                ) : copy.kind === "first-run" && (onNew || offer) ? (
                    <div className="flex flex-wrap justify-center gap-2">
                        {onNew ? (
                            <Button type="button" onClick={onNew}>
                                New order
                            </Button>
                        ) : null}
                        {offer ? <ShareLinkButton link={offer} /> : null}
                    </div>
                ) : undefined
            }
        />
    );
}
