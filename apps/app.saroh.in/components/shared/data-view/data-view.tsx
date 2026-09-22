"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import {
    ArrowDown,
    ArrowUp,
    LayoutGrid,
    List,
    Search,
    Table2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import type { DataColumn, DataViewMode, DataViewProps } from "./types";
import { useViewMode } from "./use-view-mode";

/**
 * How long the table waits before re-filtering.
 *
 * The same 180ms the command palette uses for its search, so the product has
 * one answer to "how long after I stop typing". Short enough to read as
 * instant, long enough that a burst of keystrokes costs one render.
 */
const SEARCH_DEBOUNCE_MS = 180;

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
    noun = { one: "row", other: "rows" },
    searchPlaceholder = "Search…",
    toolbarExtra,
    countLabel,
    hideModeToggle = false,
    onRowClick,
    selectable = false,
    bulkActions,
    emptyState,
}: DataViewProps<TRow>) {
    const { mode, choose } = useViewMode(viewId, modes, defaultMode);
    const showModes = modes.length > 1 && !hideModeToggle;
    /*
     * The parent holds only the SETTLED term.
     *
     * The keystroke never reaches this component: `SearchField` below owns the
     * text it shows and hands the term up once typing pauses. That is the
     * whole point — `DataView` renders every row, so a re-render here costs
     * ~31ms over 600 rows, and debouncing the FILTER alone would have saved
     * the 0.038ms the filter actually takes while still paying the 31ms.
     *
     * `clearNonce` resets the field from out here: clearing is the parent's
     * decision (the empty state offers it) and the field is uncontrolled.
     */
    const [search, setSearch] = useState("");
    const [clearNonce, setClearNonce] = useState(0);
    const clearSearch = () => {
        setSearch("");
        setClearNonce((n) => n + 1);
    };
    const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(
        null,
    );
    const [selected, setSelected] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const count = (n: number) => `${n} ${n === 1 ? noun.one : noun.other}`;

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

        if (search.trim() && (searchableColumnIds?.length ?? 0) > 0) {
            const needle = search.trim().toLowerCase();
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
    }, [rows, columns, search, searchableColumnIds, sort, activeFilter]);

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

    // A selection only ever holds rows that still exist: a row deleted or
    // filtered away by a refresh must not stay counted in the bulk bar.
    const selectedRows = rows.filter((r) => selected.has(rowKey(r)));
    const visibleKeys = visible.map(rowKey);
    const selectedInView = visibleKeys.filter((k) => selected.has(k)).length;
    const allInView =
        visibleKeys.length > 0 && selectedInView === visibleKeys.length;
    const toggleRow = (key: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    // Select-all takes the view, never the whole dataset (brand file §10).
    const toggleAll = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            for (const key of visibleKeys) {
                if (allInView) next.delete(key);
                else next.add(key);
            }
            return next;
        });
    const clearSelection = () => setSelected(new Set());
    const firstFilter = filters?.at(0);

    /** Normalised once so the guards below are plain length checks. */
    const searchable = searchableColumnIds ?? [];
    // One filter is not a filter — a lone chip nobody can switch away from is
    // chrome that costs a row of height and answers nothing.
    const hasFilters = (filters?.length ?? 0) > 1;
    const listColumns = columns.filter((c) => c.priority !== "detail");
    const tableColumns = columns.filter((c) => !c.tableHidden);

    return (
        // 14px between tabs, toolbar and table, as the applied screens space them.
        <div className="space-y-[14px]">
            {/*
             * Header tabs, when they filter (brand file §13): sub-views of the
             * same rows — All, Unfulfilled, Refunds — each with its count.
             * They filter the list, they never navigate, so they carry
             * `aria-pressed`, not `aria-current`; the page marker belongs to
             * the rail and appears once per screen.
             */}
            {hasFilters ? (
                <div
                    role="group"
                    aria-label="Filter"
                    className="-mt-2 flex flex-wrap gap-0.5 border-b border-border"
                >
                    {filters?.map((f) => {
                        const on = f.id === filterId;
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
                                    "flex items-center gap-[7px] rounded-t-md px-[13px] py-[9px] text-[13.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                    on
                                        ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                        : "font-medium text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {f.label}
                                <span
                                    className={cn(
                                        "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                        on
                                            ? "bg-muted text-foreground"
                                            : "bg-foreground/[0.04] text-muted-foreground",
                                    )}
                                >
                                    {n}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}

            {/* The toolbar: search, density, and how many rows are showing. */}
            {searchable.length > 0 || showModes || toolbarExtra ? (
                <div className="flex flex-wrap items-center gap-2.5">
                    {searchable.length > 0 ? (
                        <div className="relative min-w-[200px] max-w-[320px] flex-1">
                            <Search
                                aria-hidden
                                className="pointer-events-none absolute left-[11px] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            />
                            <SearchField
                                key={clearNonce}
                                onSettled={setSearch}
                                placeholder={searchPlaceholder}
                                aria-label={searchPlaceholder.replace(/…$/, "")}
                                className="h-[38px] pl-[34px] text-[13.5px] coarse:h-11"
                            />
                        </div>
                    ) : null}

                    {toolbarExtra}

                    {showModes ? (
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
                                            "h-7 gap-1.5 rounded-sm px-2.5 text-xs font-medium coarse:h-11 coarse:px-3.5",
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

                    <p
                        className="ml-auto text-xs text-muted-foreground"
                        aria-live="polite"
                    >
                        {countLabel
                            ? countLabel(visible.length, rows.length)
                            : visible.length === rows.length
                              ? count(rows.length)
                              : `${visible.length} of ${count(rows.length)}`}
                    </p>
                </div>
            ) : null}

            {error ? (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive-subtle px-4 py-3 text-sm text-destructive-subtle-foreground"
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
                /*
                 * Three kinds of empty (brand file §14), each answering "what
                 * do I do now?". No results offers the way back; a filter with
                 * nothing in it names the narrowing, so it never reads as "you
                 * have no leads"; first run offers the primary action.
                 */
                /* `search`, not `query`: the message has to name the term
                   the rows on screen were filtered by. Reading the immediate
                   value would announce "No products match zzz" while the
                   previous results were still sitting underneath it. */
                search.trim() ? (
                    <EmptyPanel
                        icon={<Search />}
                        title={`No ${noun.other} match “${search.trim()}”`}
                        note="Clear the search to see everything in this view."
                        action={
                            <Button
                                type="button"
                                variant="outline"
                                onClick={clearSearch}
                            >
                                Clear search
                            </Button>
                        }
                    />
                ) : activeFilter?.predicate && rows.length > 0 ? (
                    <EmptyPanel
                        title={`Nothing in “${activeFilter.label}”`}
                        note={`${count(rows.length)} in total.`}
                        action={
                            firstFilter ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => chooseFilter(firstFilter.id)}
                                >
                                    Show {firstFilter.label.toLowerCase()}
                                </Button>
                            ) : null
                        }
                    />
                ) : emptyState ? (
                    <EmptyPanel {...emptyState} />
                ) : (
                    <EmptyPanel
                        title={
                            typeof empty === "string"
                                ? empty
                                : "Nothing here yet."
                        }
                    >
                        {typeof empty === "string" ? null : empty}
                    </EmptyPanel>
                )
            ) : mode === "table" ? (
                // Horizontal scroll is on the wrapper, never the page: a table
                // that widens the document breaks every other element on it.
                <div className="overflow-x-auto rounded-[11px] border border-border bg-card">
                    <table className="w-full border-collapse text-[13.5px]">
                        <thead>
                            {/* A faint head fill and a stronger rule, as the
                                applied Products screen draws it. */}
                            <tr className="h-10 border-b border-border bg-foreground/[0.03]">
                                {selectable ? (
                                    <th
                                        scope="col"
                                        /*
                                         * `text-left` is load-bearing: a <th>
                                         * centres its content by default and a
                                         * <td> does not, so these two cells
                                         * carried the same classes and put
                                         * their checkboxes in different
                                         * places — the header's sat ~4px right
                                         * of every row's, and the column read
                                         * as crooked.
                                         */
                                        className="w-[38px] pl-[14px] text-left"
                                    >
                                        <Checkbox
                                            checked={
                                                allInView
                                                    ? true
                                                    : selectedInView > 0
                                                      ? "indeterminate"
                                                      : false
                                            }
                                            onCheckedChange={toggleAll}
                                            aria-label={`Select every ${noun.one} in this view`}
                                        />
                                    </th>
                                ) : null}
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
                                            style={
                                                col.width
                                                    ? { width: col.width }
                                                    : undefined
                                            }
                                            className={cn(
                                                "whitespace-nowrap px-[14px] text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
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
                                                        // Sorting a column is a
                                                        // real action, and on a
                                                        // touch pointer a 20px
                                                        // header is not a target
                                                        // (#178). The browser
                                                        // harness found these;
                                                        // reading the filter row
                                                        // by hand did not.
                                                        "inline-flex items-center gap-1 uppercase hover:text-foreground coarse:min-h-11",
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
                                        className="w-[44px] px-[14px]"
                                    >
                                        <span className="sr-only">Actions</span>
                                    </th>
                                ) : null}
                            </tr>
                        </thead>
                        <tbody>
                            {/* `wk-item` staggers rows in (workspace.css caps
                                it at six items, so no row waits). Hover is
                                the translucent Ink wash (brand file §22), and
                                transitions stay on colour only — a table that
                                moves on hover is unreadable while scanning. */}
                            {visible.map((row, rowIndex) => {
                                const key = rowKey(row);
                                const isSelected = selected.has(key);
                                return (
                                    <tr
                                        key={key}
                                        style={
                                            {
                                                "--wk-i": rowIndex,
                                            } as React.CSSProperties
                                        }
                                        data-state={
                                            isSelected ? "selected" : undefined
                                        }
                                        // The row is the action (brand file §10):
                                        // anywhere on it opens the item. Controls
                                        // inside stop the click.
                                        onClick={
                                            onRowClick
                                                ? () => onRowClick(row)
                                                : undefined
                                        }
                                        className={cn(
                                            "wk-item border-b border-border transition-colors duration-fast last:border-b-0 hover:bg-foreground/[0.035] data-[state=selected]:bg-brand-subtle",
                                            onRowClick && "cursor-pointer",
                                        )}
                                    >
                                        {selectable ? (
                                            <td
                                                className="w-[38px] pl-[14px] align-middle"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() =>
                                                        toggleRow(key)
                                                    }
                                                    aria-label={`Select ${noun.one}`}
                                                />
                                            </td>
                                        ) : null}
                                        {tableColumns.map((col, colIndex) => {
                                            const href = rowHref?.(row);
                                            return (
                                                <td
                                                    key={col.id}
                                                    className={cn(
                                                        "px-[14px] py-[11px] align-middle",
                                                        col.numeric &&
                                                            "text-right tabular-nums",
                                                        // Money is the figure people
                                                        // scan for: Space Grotesk.
                                                        col.money &&
                                                            "font-display font-semibold",
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
                                                    ) : onRowClick &&
                                                      colIndex === 0 ? (
                                                        // A real button, so the row
                                                        // that opens on click also
                                                        // opens from the keyboard.
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onRowClick(row);
                                                            }}
                                                            className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            {col.cell(row)}
                                                        </button>
                                                    ) : (
                                                        col.cell(row)
                                                    )}
                                                </td>
                                            );
                                        })}
                                        {rowActions ? (
                                            <td
                                                className="w-[44px] whitespace-nowrap px-[14px] text-right align-middle"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {rowActions(row)}
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })}
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
                <ul className="divide-y rounded-xl border border-border bg-card">
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
                                                        col.money &&
                                                            "font-display font-semibold text-foreground",
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

            {/*
             * The bulk bar (brand file §10, §14): a persistent mode while
             * anything is selected, pinned to the bottom edge. A toast that
             * arrives meanwhile stacks above it, never over it.
             */}
            {selectable && selectedRows.length > 0 ? (
                <div
                    role="region"
                    aria-label="Selection"
                    className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[11px] bg-primary px-[15px] py-[11px] text-primary-foreground shadow-lg"
                >
                    <span className="text-[13px] font-semibold">
                        {count(selectedRows.length)} selected
                    </span>
                    {selectedRows.length > selectedInView ? (
                        <span className="text-[11.5px] opacity-80">
                            {selectedInView} in this view
                        </span>
                    ) : null}
                    <div className="ml-auto flex flex-wrap gap-[7px]">
                        {bulkActions?.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                onClick={() =>
                                    action.run(selectedRows, clearSelection)
                                }
                                className={cn(
                                    "h-8 rounded-lg px-3 text-[12.5px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground",
                                    action.tone === "destructive"
                                        ? "bg-[#B3261E] text-white hover:bg-[#8F1E18]"
                                        : "border border-primary-foreground/30 hover:bg-primary-foreground/10",
                                )}
                            >
                                {action.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Shown when neither search nor density is on offer, so a list
                still says how much it holds. */}
            {searchable.length === 0 &&
            !showModes &&
            !toolbarExtra &&
            visible.length > 0 ? (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {count(rows.length)}
                </p>
            ) : null}
        </div>
    );
}

/**
 * An empty, no-match or failed region, drawn as the brand file draws it
 * (§14): a dashed Ink 300 edge, an icon, the title in Space Grotesk, one line
 * saying what to do, and the action that does it.
 */
function EmptyPanel({
    icon,
    title,
    note,
    action,
    children,
}: {
    icon?: React.ReactNode;
    title: string;
    note?: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-[9px] rounded-[11px] border border-dashed border-border-strong px-6 py-12 text-center">
            {icon ? (
                <div
                    aria-hidden
                    className="text-muted-foreground [&_svg]:size-8 [&_svg]:stroke-[1.7]"
                >
                    {icon}
                </div>
            ) : null}
            <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                {title}
            </p>
            {note ? (
                <p className="max-w-[44ch] text-[13.5px] leading-[1.55] text-muted-foreground">
                    {note}
                </p>
            ) : null}
            {children}
            {action ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}

/**
 * The search box, deliberately cut off from the table.
 *
 * It owns the text it displays, so typing re-renders THIS — one input — and
 * nothing else. The term reaches `DataView` only once typing pauses, and only
 * then does the table do its work.
 *
 * That separation is the fix, not the timer. Debouncing while the input still
 * lived in `DataView` moved the cheap half (filtering, 0.038ms over 600 rows)
 * off the keystroke and left the expensive half (rendering 600 rows, ~31ms) on
 * it — so every character still dropped two frames, and the results lagged as
 * well. Measured both ways before this shape was settled on.
 */
function SearchField({
    onSettled,
    placeholder,
    className,
    "aria-label": ariaLabel,
}: {
    /** Called with the term once typing has paused. */
    onSettled: (value: string) => void;
    placeholder: string;
    className?: string;
    "aria-label": string;
}) {
    const [text, setText] = useState("");
    const settle = useDebouncedCallback(onSettled, SEARCH_DEBOUNCE_MS);

    return (
        <Input
            value={text}
            onChange={(e) => {
                setText(e.target.value);
                settle(e.target.value);
            }}
            // A pause is what the timer waits for, and leaving the field is a
            // longer pause than any timer. Without this, tabbing straight to
            // the next control leaves the table showing the previous term.
            onBlur={() => settle.flush()}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={className}
        />
    );
}
