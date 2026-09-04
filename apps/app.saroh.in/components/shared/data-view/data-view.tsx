"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import { ArrowDown, ArrowUp, LayoutGrid, List, Table2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { DataColumn, DataViewMode, DataViewProps } from "./types";
import { useViewMode } from "./use-view-mode";

const MODE_META: Record<DataViewMode, { label: string; icon: typeof Table2 }> =
    {
        table: { label: "Table", icon: Table2 },
        grid: { label: "Grid", icon: LayoutGrid },
        list: { label: "List", icon: List },
    };

/**
 * One dataset, three densities.
 *
 * This exists because the app was fifteen screens of the same shape — a header
 * and one list — each re-implementing its own empty state, its own sort, its own
 * responsive behaviour, and each forgetting a different one. Sort, filter,
 * empty, loading and error live here so no screen has to remember them.
 *
 * The density rule the callers never see: a column declares how much it MATTERS
 * (`priority`), not where it goes. The list rendering shows primary and
 * secondary and drops detail; the table shows everything. That is why adding a
 * column to a screen adds it to every rendering at once, and why the phone
 * rendering cannot silently rot into a worse version of the desktop one.
 */
export function DataView<TRow>({
    viewId,
    rows,
    columns,
    rowKey,
    rowHref,
    rowActions,
    modes = ["table", "list"],
    defaultMode = "table",
    renderCard,
    empty,
    searchableColumnIds,
    filters,
    initialFilterId,
    isLoading = false,
    error = null,
}: DataViewProps<TRow>) {
    const { mode, choose } = useViewMode(viewId, modes, defaultMode);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(
        null,
    );

    /*
     * An unknown `?view=` falls back to the first filter rather than showing
     * nothing. A stale bookmark, or a filter renamed since the link was sent,
     * must not present as an empty dataset — that reads as "you have no leads",
     * which is a far more alarming lie than "here is everything".
     */
    const known = filters?.some((f) => f.id === initialFilterId) ?? false;
    const [filterId, setFilterId] = useState<string | undefined>(
        known ? initialFilterId : filters?.[0]?.id,
    );
    const activeFilter = filters?.find((f) => f.id === filterId);

    const chooseFilter = (next: string) => {
        setFilterId(next);
        /*
         * The URL is updated but NOT navigated: `history.replaceState` keeps the
         * address shareable and the back button honest without a server round
         * trip that would re-fetch rows we already hold. `router.replace` would
         * re-render the whole route to change one query param.
         */
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (next === filters?.[0]?.id) url.searchParams.delete("view");
        else url.searchParams.set("view", next);
        window.history.replaceState(null, "", url.toString());
    };

    const visible = useMemo(() => {
        let out = rows;

        if (activeFilter?.predicate) {
            out = out.filter(activeFilter.predicate);
        }

        if (query.trim() && (searchableColumnIds?.length ?? 0) > 0) {
            const needle = query.trim().toLowerCase();
            const ids = searchableColumnIds ?? [];
            const cols = columns.filter((c) => ids.includes(c.id));
            out = out.filter((row) =>
                cols.some((c) => {
                    // Search the SORT value, not the rendered cell: a cell may
                    // be a React node, and stringifying one gives "[object
                    // Object]" — a filter that silently matches nothing.
                    if (!c.sortValue) return false;
                    return String(c.sortValue(row))
                        .toLowerCase()
                        .includes(needle);
                }),
            );
        }

        if (sort) {
            const col = columns.find((c) => c.id === sort.id);
            if (col?.sortValue) {
                const get = col.sortValue;
                out = [...out].sort((a, b) => {
                    const av = get(a);
                    const bv = get(b);
                    const cmp =
                        typeof av === "number" && typeof bv === "number"
                            ? av - bv
                            : String(av).localeCompare(String(bv));
                    return sort.desc ? -cmp : cmp;
                });
            }
        }

        return out;
    }, [rows, columns, query, searchableColumnIds, sort, activeFilter]);

    const toggleSort = (col: DataColumn<TRow>) => {
        if (!col.sortValue) return;
        setSort((prev) =>
            prev?.id === col.id
                ? prev.desc
                    ? null // third click clears — sorting is reversible
                    : { id: col.id, desc: true }
                : { id: col.id, desc: false },
        );
    };

    /** Normalised once so the guards below are plain length checks. */
    const searchable = searchableColumnIds ?? [];
    // One filter is not a filter — a lone chip nobody can switch away from is
    // chrome that costs a row of height and answers nothing.
    const hasFilters = (filters?.length ?? 0) > 1;
    const listColumns = columns.filter((c) => c.priority !== "detail");
    const tableColumns = columns.filter((c) => !c.tableHidden);

    return (
        <div className="space-y-4">
            {/* Controls. Search, subset and density sit together because they
                are the same job: getting to the rows that matter. */}
            {searchable.length > 0 || modes.length > 1 || hasFilters ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {searchable.length > 0 ? (
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search…"
                                aria-label="Search this view"
                                className="h-9 w-full max-w-xs sm:w-64"
                            />
                        ) : null}

                        {hasFilters ? (
                            <div
                                role="group"
                                aria-label="Filter"
                                className="flex flex-wrap items-center gap-1"
                            >
                                {filters?.map((f) => {
                                    const on = f.id === filterId;
                                    // The count is on the chip because the
                                    // question "how many are overdue?" is
                                    // usually the reason for reaching for it.
                                    const n = f.predicate
                                        ? rows.filter(f.predicate).length
                                        : rows.length;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => chooseFilter(f.id)}
                                            className={cn(
                                                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                                                on
                                                    ? "border-brand/50 bg-brand/10 text-foreground"
                                                    : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                            )}
                                        >
                                            {f.label}
                                            <span className="tabular-nums opacity-60">
                                                {n}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {modes.length > 1 ? (
                        <div
                            role="group"
                            aria-label="View density"
                            className="flex items-center rounded-md border border-border p-0.5"
                        >
                            {modes.map((m) => {
                                const Icon = MODE_META[m].icon;
                                const on = m === mode;
                                return (
                                    <Button
                                        key={m}
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        aria-pressed={on}
                                        onClick={() => choose(m)}
                                        className={cn(
                                            "h-7 gap-1.5 rounded-sm px-2.5 text-xs font-medium",
                                            on &&
                                                "bg-accent text-accent-foreground",
                                        )}
                                    >
                                        <Icon className="size-3.5" />
                                        <span className="hidden sm:inline">
                                            {MODE_META[m].label}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {error ? (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                    {error}
                </p>
            ) : isLoading ? (
                <div className="space-y-2" aria-busy="true">
                    {/* The shared Skeleton, not a local animate-pulse block:
                        a route-level loading.tsx and an in-view refresh should
                        not animate differently on the same screen. */}
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-12" />
                    ))}
                </div>
            ) : visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                    {/* Naming the narrowing matters: an empty result under an
                        active filter must not read as "you have no leads". */}
                    {query.trim()
                        ? `Nothing matches “${query.trim()}”.`
                        : activeFilter?.predicate && rows.length > 0
                          ? `Nothing in “${activeFilter.label}”. ${rows.length} ${rows.length === 1 ? "row" : "rows"} in total.`
                          : (empty ?? "Nothing here yet.")}
                </div>
            ) : mode === "table" ? (
                // Horizontal scroll is on the wrapper, never the page: a table
                // that widens the document breaks every other element on it.
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/60">
                                {tableColumns.map((col) => {
                                    const active = sort?.id === col.id;
                                    return (
                                        <th
                                            key={col.id}
                                            scope="col"
                                            aria-sort={
                                                active
                                                    ? sort.desc
                                                        ? "descending"
                                                        : "ascending"
                                                    : undefined
                                            }
                                            className={cn(
                                                "whitespace-nowrap px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground",
                                                col.numeric && "text-right",
                                            )}
                                        >
                                            {col.sortValue ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleSort(col)
                                                    }
                                                    className={cn(
                                                        "inline-flex items-center gap-1 hover:text-foreground",
                                                        active &&
                                                            "text-foreground",
                                                    )}
                                                >
                                                    {col.header}
                                                    {active ? (
                                                        sort.desc ? (
                                                            <ArrowDown className="size-3" />
                                                        ) : (
                                                            <ArrowUp className="size-3" />
                                                        )
                                                    ) : null}
                                                </button>
                                            ) : (
                                                col.header
                                            )}
                                        </th>
                                    );
                                })}
                                {rowActions ? (
                                    <th
                                        scope="col"
                                        className="w-px px-3 py-2.5"
                                    >
                                        <span className="sr-only">Actions</span>
                                    </th>
                                ) : null}
                            </tr>
                        </thead>
                        <tbody>
                            {/* `wk-item` staggers rows in (workspace.css caps
                                the delay at 12 items, so a 200-row table's
                                last row never waits). Transitions stay on
                                colour only — a table that moves on hover is
                                unreadable while scanning. */}
                            {visible.map((row, rowIndex) => (
                                <tr
                                    key={rowKey(row)}
                                    style={
                                        {
                                            "--wk-i": rowIndex,
                                        } as React.CSSProperties
                                    }
                                    className="wk-item border-b border-border transition-colors last:border-b-0 hover:bg-accent/50"
                                >
                                    {tableColumns.map((col, colIndex) => {
                                        const href = rowHref?.(row);
                                        return (
                                            <td
                                                key={col.id}
                                                className={cn(
                                                    "px-3 py-2.5 align-middle",
                                                    col.numeric &&
                                                        "text-right tabular-nums",
                                                )}
                                            >
                                                {/*
                                                 * The FIRST cell carries the
                                                 * row link, not the row.
                                                 *
                                                 * List mode stretches an
                                                 * overlay anchor across the
                                                 * row, which a `tr` cannot
                                                 * hold: `position: relative`
                                                 * on a table row is not
                                                 * reliable across browsers, so
                                                 * the overlay would escape to
                                                 * the table. Anchoring the
                                                 * link to one cell keeps a
                                                 * real, focusable target with
                                                 * real text, and keeps it out
                                                 * of the cells where callers
                                                 * put their own links — a
                                                 * booking's contact link would
                                                 * otherwise nest inside it.
                                                 */}
                                                {href && colIndex === 0 ? (
                                                    <Link
                                                        href={href}
                                                        className="block rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {col.cell(row)}
                                                    </Link>
                                                ) : (
                                                    col.cell(row)
                                                )}
                                            </td>
                                        );
                                    })}
                                    {rowActions ? (
                                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle">
                                            {rowActions(row)}
                                        </td>
                                    ) : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : mode === "grid" && renderCard ? (
                // `[&>*]:h-full` reaches through whatever the caller returns —
                // usually a Link wrapping a Card. Without it the card's own
                // `h-full` resolves against a link that is only as tall as its
                // text, so a row of cards with different amounts of content
                // ends up ragged. Enforced here rather than asked of every
                // caller, because it is a property of the grid, not the card.
                <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((row) => (
                        <div key={rowKey(row)} className="[&>*]:h-full">
                            {renderCard(row)}
                        </div>
                    ))}
                </div>
            ) : (
                // List: the whole row is the target, which is what one-handed
                // and gloved use needs. Detail columns are dropped, not hidden
                // behind a disclosure nobody taps.
                <ul className="divide-y rounded-xl border border-border">
                    {visible.map((row, rowIndex) => {
                        // `.at()` rather than a destructure: a caller could
                        // declare only `detail` columns, leaving this empty,
                        // and index access would type as always-present.
                        const primary = listColumns.at(0);
                        const rest = listColumns.slice(1);
                        const href = rowHref?.(row);
                        const body = (
                            <div className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0 space-y-1">
                                    <div className="truncate font-medium">
                                        {primary?.cell(row)}
                                    </div>
                                    {rest.length ? (
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            {rest.map((col) => (
                                                <span
                                                    key={col.id}
                                                    className={cn(
                                                        "inline-flex items-center gap-1",
                                                        col.numeric &&
                                                            "tabular-nums",
                                                    )}
                                                >
                                                    {col.cell(row)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                        return (
                            <li
                                key={rowKey(row)}
                                style={
                                    {
                                        "--wk-i": rowIndex,
                                    } as React.CSSProperties
                                }
                                className="wk-item relative flex items-center gap-2 pr-3 transition-colors hover:bg-accent/50"
                            >
                                {/*
                                 * An OVERLAY link, not a wrapper.
                                 *
                                 * Wrapping the row nested the caller's own cell
                                 * anchor inside it — invalid HTML, and React
                                 * reported it as a hydration error on every list
                                 * render. Callers put a link in the primary cell
                                 * because the TABLE needs one there, and a
                                 * primitive that silently forbids that would be
                                 * a trap.
                                 *
                                 * So the row's tap target is a sibling stretched
                                 * over the row, `aria-hidden` and out of the tab
                                 * order: the cell's real link stays the single
                                 * accessible name and the single focus stop,
                                 * while the whole row remains tappable, which is
                                 * what one-handed and gloved use needs.
                                 */}
                                {href ? (
                                    <Link
                                        href={href}
                                        aria-hidden
                                        tabIndex={-1}
                                        className="absolute inset-0"
                                    />
                                ) : null}
                                {/* Clicks fall through to the overlay EXCEPT on
                                    the caller's own interactive elements, which
                                    keep theirs. */}
                                <div className="pointer-events-none relative min-w-0 flex-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
                                    {body}
                                </div>
                                {rowActions ? (
                                    // Actions sit outside the overlay's reach: a
                                    // cancel tap must not also navigate.
                                    <div className="relative shrink-0">
                                        {rowActions(row)}
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            {visible.length > 0 ? (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {visible.length === rows.length
                        ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}`
                        : `${visible.length} of ${rows.length} rows`}
                </p>
            ) : null}
        </div>
    );
}
