"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
    DEFAULT_PAGE_SIZE,
    PAGE_SIZES,
    pageNumbers,
    pagesOf,
    readPageSize,
} from "../../lib/paging";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { chipClass } from "./chip";
import { CountBadge } from "./count-badge";
import type { Option } from "./option-select";
import { OptionSelect } from "./option-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/*
 * THE ONE LIST TOOLBAR.
 *
 * Every list in the workspace is laid out the same, from the top:
 *
 *   1. `tabs`     the screen's views, if it has any (`TabStrip`)
 *   2. ONE row:   `search` first (`ListSearch`, one width), then at most
 *                 THREE dropdowns (`ListFilter`: the list's most used),
 *                 then `more` (one "Filters" button for the rest,
 *                 `MoreFilters`), at most one attention toggle
 *                 (`AttentionToggle`), and "Clear filters" once anything
 *                 is narrowed. On the right, `end` (the sort and the
 *                 table/list/grid switch) and `count` ("Showing 1 to 50
 *                 of 532").
 *   3. the table  (the caller's, below the toolbar)
 *
 * There is no second row of chips: a status or kind filter is one more
 * dropdown in the row (owner, 11 Oct 2026).
 *
 * A slot left out takes no room. If the row wraps, the search keeps its
 * width, the dropdowns flow after it, and the right-hand group stays on
 * the first line. The count is on the right from `lg`. Below that, where
 * the row has no room for it, it is one quiet line under the toolbar, on
 * the left: never floating right on a line of its own. On a phone the
 * search takes the full width first and nothing is held to its own width
 * (no `shrink-0`), so a row of controls can never run past the screen.
 */
export interface ListToolbarProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children"
> {
    /** The screen's views: a `TabStrip`. Above everything else. */
    tabs?: React.ReactNode;
    /** The list's search: one `ListSearch`. First in the row. */
    search?: React.ReactNode;
    /**
     * The list's most used filters, each a `ListFilter` dropdown: at most
     * THREE. After the search.
     */
    filters?: React.ReactNode;
    /** Every other filter, behind one button: `MoreFilters`. */
    more?: React.ReactNode;
    /**
     * Puts everything back: the search, every dropdown, the toggle. Pass
     * it only while something is narrowed (a search with words in it
     * counts): "Clear filters" then ends the row.
     */
    onClear?: () => void;
    /**
     * At most ONE `AttentionToggle`, after the dropdowns: the one-press
     * way to what needs the merchant now ("Needs you 4").
     */
    attention?: React.ReactNode;
    /** Pushed to the right: the sort, then the view switch. */
    end?: React.ReactNode;
    /** How many are showing, in words. Last on the right. */
    count?: React.ReactNode;
}

/** A slot that was given something to draw. */
const drawn = (node: React.ReactNode) =>
    node !== null && node !== undefined && node !== false && node !== "";

export function ListToolbar({
    tabs,
    search,
    filters,
    more,
    onClear,
    attention,
    end,
    count,
    className,
    ...props
}: ListToolbarProps) {
    const left =
        [search, filters, more, attention].some(drawn) || onClear !== undefined;
    const right = drawn(end);
    if (!drawn(tabs) && !left && !right && !drawn(count)) return null;
    return (
        <div
            data-list-toolbar=""
            // From `lg` two columns: the row, and the count beside its
            // first line. Below that the count is the next line down.
            className={cn(
                "flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-3",
                className,
            )}
            {...props}
        >
            {drawn(tabs) ? (
                <div data-slot="list-tabs" className="min-w-0 lg:col-span-2">
                    {tabs}
                </div>
            ) : null}
            {left || right ? (
                <div
                    data-slot="list-row"
                    // Two columns from `sm`, both starting at the top: the
                    // left one wraps on itself, so the right-hand group
                    // stays on the first line however many filters wrap.
                    className={cn(
                        "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start",
                        !drawn(count) && "lg:col-span-2",
                    )}
                >
                    {left ? (
                        <div
                            data-slot="list-main"
                            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                        >
                            {drawn(search) ? (
                                <div
                                    data-slot="list-search"
                                    className="w-full min-w-0 sm:w-auto sm:flex-[0_1_320px]"
                                >
                                    {search}
                                </div>
                            ) : null}
                            {drawn(filters) ? (
                                <div
                                    data-slot="list-filters"
                                    // `contents`: each dropdown wraps as
                                    // an item of the row itself, so they
                                    // flow on after the search.
                                    className="contents"
                                >
                                    {filters}
                                </div>
                            ) : null}
                            {drawn(more) ? (
                                <div
                                    data-slot="list-more"
                                    className="flex min-w-0 max-w-full"
                                >
                                    {more}
                                </div>
                            ) : null}
                            {drawn(attention) ? (
                                <div
                                    data-slot="list-attention"
                                    className="flex min-w-0 max-w-full"
                                >
                                    {attention}
                                </div>
                            ) : null}
                            {onClear ? (
                                // Quiet, and last: the way back to
                                // everything, wherever it was narrowed.
                                <Button
                                    data-slot="list-clear"
                                    type="button"
                                    variant="link"
                                    size="inline"
                                    onClick={onClear}
                                    className="min-w-0 rounded-sm px-1 text-[13px] text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground active:text-muted-foreground"
                                >
                                    Clear filters
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                    {drawn(end) ? (
                        <div
                            data-slot="list-end"
                            className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto sm:max-w-[45%] sm:justify-end"
                        >
                            {end}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {drawn(count) ? (
                // ONE element, placed by the width: on the right of the
                // row's first line from `lg` (as tall as a control, so it
                // sits on that line's middle), and where the row has no
                // room for it, one quiet line under the toolbar, on the
                // left. Never floating right on a line of its own.
                <p
                    data-slot="list-count"
                    aria-live="polite"
                    className={cn(
                        "min-w-0 text-xs tabular-nums text-muted-foreground max-lg:-mt-1 lg:flex lg:min-h-[38px] lg:items-center",
                        !(left || right) && "lg:col-span-2",
                    )}
                >
                    {count}
                </p>
            ) : null}
        </div>
    );
}

/**
 * The trigger of a toolbar control that must stay an `OptionSelect` of a
 * screen's own (a filter bar that is also drawn stacked in a sheet): the
 * same box as `ListFilter`'s.
 */
export const listFilterClass =
    "w-auto min-w-0 max-w-full gap-2 [&>span]:min-w-0 [&>svg]:shrink-0";

/**
 * The same box on a `Button variant="outline"` that opens a picker (a
 * product search): the select's fill, edge, height and type, so it and the
 * dropdowns beside it read as one family.
 */
export const listPickerClass =
    "h-[38px] min-w-0 max-w-[220px] justify-between gap-2 rounded-md border-input bg-field px-3 text-sm font-normal coarse:h-11 coarse:text-base";

/** A narrowed filter's box: the selected look, an Ink edge. */
export const NARROWED = "border-foreground";

/**
 * The one filter of a list toolbar, and its sort: an `OptionSelect` as
 * wide as its words, the search field's height, with the same gap before
 * its chevron whatever it says.
 *
 * - `label` is its accessible name: what it filters ("Order status",
 *   "Location", "Kind of change").
 * - The FIRST option is the unnarrowed one, and says what the filter is
 *   about in the thing's own plural: "All orders", "All locations", "All
 *   categories". Never a bare "All", and never "Any …".
 * - An option's `count` is drawn as a quiet number at its right, and after
 *   the label in the box once a narrowed option is chosen ("Open 3").
 *   Leave it out when it isn't known.
 */
export function ListFilter<V extends string>({
    label,
    value,
    onValueChange,
    options,
    footer,
    holdsData = false,
    narrowed,
    className,
}: {
    label: string;
    value: V;
    onValueChange: (value: V) => void;
    options: readonly Option<V>[];
    /**
     * Whether it narrows the list now: its box then takes the selected
     * look (an Ink edge). Worked out for a filter (any option but the
     * first); pass `false` for a sort, which narrows nothing.
     */
    narrowed?: boolean;
    /** A line under the options, about what choosing one does. */
    footer?: React.ReactNode;
    /**
     * The options are records' own names (locations, products), so a
     * session recording masks the box. A select's value is masked unless
     * someone marks it, so this only documents the call.
     */
    holdsData?: boolean;
    className?: string;
}) {
    const on = narrowed ?? (options.length > 0 && value !== options[0].value);
    return (
        <span
            data-list-filter=""
            data-narrowed={on ? "" : undefined}
            data-ph-mask={holdsData ? "" : undefined}
            className="inline-flex min-w-0 max-w-full"
        >
            <OptionSelect
                aria-label={label}
                value={value}
                onValueChange={onValueChange}
                options={options}
                footer={footer}
                className={cn(listFilterClass, on && NARROWED, className)}
            />
        </span>
    );
}

const figures = new Intl.NumberFormat("en-IN");

/**
 * The ONE chip a list toolbar may hold: an on/off filter for what needs
 * the merchant now ("Needs you 4", "Needs attention 1"), after the
 * dropdowns in the same row. A one-press shortcut, so use it sparingly: at
 * most one per list, and never on a row of its own. Everything else is a
 * `ListFilter`.
 *
 * While its count is above zero and it is off, the count wears the
 * attention tone (Ink). At zero, or unknown, it is a plain chip.
 */
export function AttentionToggle({
    label,
    count,
    on,
    onToggle,
    className,
}: {
    /** Saroh's own words: "Needs you", "Needs attention". */
    label: string;
    /** How many wait. Leave it out, or pass null, when it isn't known. */
    count?: number | null;
    on: boolean;
    onToggle: () => void;
    className?: string;
}) {
    const waiting = typeof count === "number" && count > 0;
    return (
        <button
            type="button"
            data-attention-toggle=""
            data-ph-unmask=""
            aria-pressed={on}
            onClick={onToggle}
            // The dropdowns' height, and it may shrink with the row:
            // nothing in a toolbar is held to its own width.
            className={chipClass(on, cn("h-[38px] min-w-0 shrink", className))}
        >
            {label}
            {typeof count === "number" ? (
                <>
                    {/* A real space: it is named "Needs you 4". */}{" "}
                    {waiting && !on ? (
                        <CountBadge
                            count={figures.format(count)}
                            tone="strong"
                        />
                    ) : (
                        <span className="tabular-nums opacity-70">
                            {figures.format(count)}
                        </span>
                    )}
                </>
            ) : null}
        </button>
    );
}

/**
 * Every filter past the list's three most used, behind ONE button in the
 * row: "Filters", and "Filters 2" while two of them are narrowed (then
 * with the selected look). It opens them in a popover, one to a line. On a
 * phone a list that already has a filters sheet draws that instead: one
 * mechanism per width.
 */
export function MoreFilters({
    count,
    label = "Filters",
    title,
    className,
    children,
}: {
    /** How many of the filters inside are narrowed. */
    count: number;
    label?: string;
    /** The popover's accessible name: "Filter orders". */
    title: string;
    className?: string;
    /** The filters, each full width (`OptionSelect`, a picker). */
    children: React.ReactNode;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    data-more-filters=""
                    data-ph-unmask=""
                    type="button"
                    variant="outline"
                    aria-label={count > 0 ? `${label}, ${count} on` : label}
                    className={cn(
                        "min-w-0 gap-1.5 font-medium",
                        count > 0 && NARROWED,
                        className,
                    )}
                >
                    <SlidersHorizontal aria-hidden className="size-4" />
                    {label}
                    {count > 0 ? (
                        <span aria-hidden className="tabular-nums opacity-70">
                            {figures.format(count)}
                        </span>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                aria-label={title}
                className="grid w-[min(300px,calc(100vw-2rem))] gap-2.5 p-3"
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}

export interface PageStep {
    /** Where the page is, for a list the server reads by address. */
    href?: string;
    /** Or what to do, for a list that reads the page itself. */
    onClick?: () => void;
}

const SIZE_OPTIONS: Option<string>[] = PAGE_SIZES.map((n) => ({
    value: String(n),
    label: String(n),
}));

/**
 * How every paged list ends, the table's footer: on the left, how many
 * rows a page holds (10, 25, 50 or 100) and which of them are showing
 * ("101 to 125 of 532"); on the right, Previous, the page numbers and
 * Next. The same on every list.
 *
 * It is drawn once the list is longer than the smallest page, so the
 * size can be changed back from a long page; a shorter list has no
 * footer. On a phone the numbers give way to "Page 2 of 11".
 */
export function ListPaging({
    label,
    page,
    total,
    size,
    to,
    onSize,
    className,
}: {
    /** The nav's accessible name: "Pages of orders". */
    label: string;
    /** The page on screen, from 1. */
    page: number;
    /** How many rows the whole list holds, under its filters. */
    total: number;
    /** Rows a page: one of `PAGE_SIZES`. */
    size: number;
    /** How to reach a page: an address, or what to do. */
    to: (page: number) => PageStep;
    /** A size was chosen. The caller starts again at page 1. */
    onSize: (size: number) => void;
    className?: string;
}) {
    if (total <= PAGE_SIZES[0]) return null;
    const pages = pagesOf(total, size);
    return (
        <div
            data-list-paging=""
            className={cn(
                "flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-3.5",
                className,
            )}
        >
            <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                <span aria-hidden>Rows per page</span>
                <OptionSelect
                    aria-label="Rows per page"
                    value={String(size)}
                    onValueChange={(v) => onSize(Number(v))}
                    options={SIZE_OPTIONS}
                    className={cn(listFilterClass, "w-auto tabular-nums")}
                />
                <span data-list-range="" className="tabular-nums">
                    {figures.format((page - 1) * size + 1)} to{" "}
                    {figures.format(Math.min(total, page * size))} of{" "}
                    {figures.format(total)}
                </span>
            </div>
            {pages > 1 ? (
                <nav
                    aria-label={label}
                    className="flex min-w-0 flex-wrap items-center justify-end gap-1.5"
                >
                    <PageButton
                        step={page > 1 ? to(page - 1) : null}
                        words="Previous"
                    />
                    <span className="px-1.5 text-[13px] tabular-nums text-muted-foreground sm:hidden">
                        Page {figures.format(page)} of {figures.format(pages)}
                    </span>
                    <ol className="hidden items-center gap-1.5 sm:flex">
                        {pageNumbers(page, pages).map((n, i) => (
                            <li key={n === "gap" ? `gap-${i}` : n}>
                                {n === "gap" ? (
                                    <span
                                        aria-hidden
                                        className="inline-flex w-6 justify-center text-muted-foreground"
                                    >
                                        …
                                    </span>
                                ) : (
                                    <PageNumber
                                        n={n}
                                        current={n === page}
                                        step={to(n)}
                                    />
                                )}
                            </li>
                        ))}
                    </ol>
                    <PageButton
                        step={page < pages ? to(page + 1) : null}
                        words="Next"
                    />
                </nav>
            ) : null}
        </div>
    );
}

function PageNumber({
    n,
    current,
    step,
}: {
    n: number;
    current: boolean;
    step: PageStep;
}) {
    const words = figures.format(n);
    const look = cn(
        "min-w-[38px] px-2 tabular-nums",
        current && "border-foreground bg-accent",
    );
    if (current) {
        return (
            <Button
                type="button"
                variant="outline"
                aria-current="page"
                aria-label={`Page ${words}`}
                className={look}
            >
                {words}
            </Button>
        );
    }
    if (step.href !== undefined) {
        return (
            <Button variant="outline" className={look} asChild>
                <Link
                    href={step.href}
                    scroll={false}
                    aria-label={`Page ${words}`}
                >
                    {words}
                </Link>
            </Button>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            aria-label={`Page ${words}`}
            className={look}
            onClick={step.onClick}
        >
            {words}
        </Button>
    );
}

function PageButton({ step, words }: { step: PageStep | null; words: string }) {
    if (!step) {
        return (
            <Button type="button" variant="outline" disabled>
                {words}
            </Button>
        );
    }
    if (step.href !== undefined) {
        return (
            <Button variant="outline" asChild>
                <Link href={step.href} scroll={false}>
                    {words}
                </Link>
            </Button>
        );
    }
    return (
        <Button type="button" variant="outline" onClick={step.onClick}>
            {words}
        </Button>
    );
}

// The sums live in `lib/paging` so a server page can read an address with
// them; they are handed on here for the screens that draw the footer.
export { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageNumbers, pagesOf, readPageSize };
