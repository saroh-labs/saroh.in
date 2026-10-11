"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { ViewerDate } from "@/components/shared/viewer-date";
import { personHref } from "@/lib/contacts/person-href";
import type { CustomerRow, CustomersPage } from "@/lib/customers/list";
import {
    lastSub,
    noOrderText,
    rowName,
    rowSub,
    rowTags,
    spentText,
} from "@/lib/customers/list";
import { EmptyState } from "@saroh/ui/data-state";
import { clearLabel } from "@saroh/ui/lib/state-copy";

/**
 * The design's columns: Customer · Last order · Orders · Spent. A part the
 * viewer can't read has no column at all (C3 leaves it out of the row, and
 * an empty column would read as zero): no orders without `order:read`, no
 * Spent without `invoice:read` as well.
 */
const COLS = {
    all: "sm:grid-cols-[minmax(0,2.2fr)_minmax(96px,1fr)_56px_84px]",
    orders: "sm:grid-cols-[minmax(0,2.2fr)_minmax(96px,1fr)_56px]",
    person: "sm:grid-cols-1",
} as const;

/**
 * The list's rows. On a phone each row stacks — the name and its tags, how
 * to reach them, then one line of what they bought — so nothing scrolls
 * sideways; from `sm` it is the design's table.
 */
export function Rows({
    page,
    empty,
}: {
    page: CustomersPage;
    /** What shows in place of rows when nothing matches. */
    empty: React.ReactNode;
}) {
    const cols = page.sees.spent
        ? COLS.all
        : page.sees.orders
          ? COLS.orders
          : COLS.person;
    const many = (page.storefronts?.length ?? 0) > 1;
    return (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
            <div className="sm:overflow-x-auto">
                <div className="sm:min-w-[520px]">
                    <div
                        className={cn(
                            "label hidden gap-3 border-b border-border bg-muted px-4 py-[9px] sm:grid",
                            cols,
                        )}
                    >
                        <span>Customer</span>
                        {page.sees.orders ? (
                            <>
                                <span>Last order</span>
                                <span className="text-right">Orders</span>
                            </>
                        ) : null}
                        {page.sees.spent ? (
                            <span className="text-right">Spent</span>
                        ) : null}
                    </div>
                    {page.rows.length === 0
                        ? empty
                        : page.rows.map((row, i) => (
                              <Row
                                  key={row.contactId}
                                  row={row}
                                  cols={cols}
                                  sees={page.sees}
                                  many={many}
                                  first={i === 0}
                              />
                          ))}
                </div>
            </div>
        </div>
    );
}

function Row({
    row,
    cols,
    sees,
    many,
    first,
}: {
    row: CustomerRow;
    cols: string;
    sees: CustomersPage["sees"];
    many: boolean;
    first: boolean;
}) {
    const tags = rowTags(row);
    const sub = lastSub(row, many);
    const orders = row.orders;
    return (
        <Link
            href={personHref(row.contactId)}
            className={cn(
                "grid grid-cols-1 items-center gap-x-3 gap-y-1 px-4 py-[11px] text-[13px] text-foreground transition-colors duration-fast hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-muted",
                !first && "border-t border-foreground/10",
                cols,
            )}
        >
            <span className="grid min-w-0 gap-[3px]">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="min-w-0 truncate font-semibold">
                        {rowName(row)}
                    </span>
                    {tags.map((t) => (
                        <StatusBadge key={t.label} tone={t.tone}>
                            {t.label}
                        </StatusBadge>
                    ))}
                </span>
                <span className="truncate text-[12px] text-muted-foreground">
                    {rowSub(row)}
                </span>
                {sees.orders ? (
                    // The phone's one line of what they bought; the table
                    // says it in columns from `sm`.
                    <span className="truncate text-[12px] text-muted-foreground sm:hidden">
                        {orders?.lastAt ? (
                            <ViewerDate iso={orders.lastAt} variant="recent" />
                        ) : row.addedByHand ? (
                            "Added by hand · no orders yet"
                        ) : (
                            "No orders yet"
                        )}
                        {orders ? ` · ${count(orders.count, "order")}` : null}
                        {sees.spent && row.spent && row.spent.length > 0
                            ? ` · ${spentText(row.spent)}`
                            : null}
                        {sub?.open ? (
                            <span className="text-foreground">
                                {` · ${sub.text}`}
                            </span>
                        ) : null}
                    </span>
                ) : null}
            </span>
            {sees.orders ? (
                <>
                    <span className="hidden min-w-0 gap-0.5 sm:grid">
                        <span>
                            {orders?.lastAt ? (
                                <ViewerDate
                                    iso={orders.lastAt}
                                    variant="recent"
                                />
                            ) : (
                                noOrderText(row)
                            )}
                        </span>
                        {sub ? (
                            <span
                                className={cn(
                                    "truncate text-[12px]",
                                    sub.open
                                        ? "text-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {sub.text}
                            </span>
                        ) : null}
                    </span>
                    <span className="hidden text-right tabular-nums sm:block">
                        {orders?.count ?? 0}
                    </span>
                </>
            ) : null}
            {sees.spent ? (
                <span className="hidden text-right font-medium tabular-nums sm:block">
                    {spentText(row.spent ?? [])}
                </span>
            ) : null}
        </Link>
    );
}

/** No row matches the search or filters: say which, and the way out. */
export function NoMatch({
    title,
    searched,
    onClear,
}: {
    title: string;
    /** A search term narrowed it (else only filters did). */
    searched: boolean;
    onClear: () => void;
}) {
    return (
        <div className="p-4">
            <EmptyState
                data-ph-mask=""
                kind="no-results"
                things="customers"
                cause="filters"
                title={title}
                className="border-0"
                action={
                    <Button
                        data-ph-unmask=""
                        type="button"
                        variant="outline"
                        className="wk-press"
                        onClick={onClear}
                    >
                        {clearLabel(
                            searched ? "search" : "filters",
                            "customers",
                        )}
                    </Button>
                }
            />
        </div>
    );
}
