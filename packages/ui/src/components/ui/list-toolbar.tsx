"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import type { Option } from "./option-select";
import { OptionSelect } from "./option-select";

/*
 * THE ONE LIST TOOLBAR.
 *
 * Every list in the workspace is laid out the same, from the top:
 *
 *   1. `tabs`     the screen's views, if it has any (`TabStrip`)
 *   2. one row:   `search` first (`ListSearch`, one width), then `filters`
 *                 (`ListFilter` dropdowns), then, pushed to the right,
 *                 `end` (the sort and the table/list/grid switch) and
 *                 `count` ("Showing 1 to 50 of 532")
 *   3. `chips`    the status filters of the list (`FilterChips`)
 *   4. the table  (the caller's, below the toolbar)
 *
 * A slot left out takes no room. On a phone the row wraps: search takes
 * the full width first, the filters follow, and nothing in it is held to
 * its own width (no `shrink-0`), so a row of controls can never run past
 * the screen. The chips scroll sideways inside their own scroller.
 */
export interface ListToolbarProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children"
> {
    /** The screen's views: a `TabStrip`. Above everything else. */
    tabs?: React.ReactNode;
    /** The list's search: one `ListSearch`. First in the row. */
    search?: React.ReactNode;
    /** Dropdown filters: `ListFilter`s. After the search. */
    filters?: React.ReactNode;
    /** Pushed to the right: the sort, then the view switch. */
    end?: React.ReactNode;
    /** How many are showing, in words. Last on the right. */
    count?: React.ReactNode;
    /** The status filters of the list: `FilterChips`. Under the row. */
    chips?: React.ReactNode;
}

export function ListToolbar({
    tabs,
    search,
    filters,
    end,
    count,
    chips,
    className,
    ...props
}: ListToolbarProps) {
    const row = search || filters || end || count;
    if (!tabs && !row && !chips) return null;
    return (
        <div
            data-list-toolbar=""
            className={cn("flex min-w-0 flex-col gap-3", className)}
            {...props}
        >
            {tabs ? <div data-slot="list-tabs">{tabs}</div> : null}
            {row ? (
                <div
                    data-slot="list-row"
                    className="flex min-w-0 flex-wrap items-center gap-2"
                >
                    {search ? (
                        <div
                            data-slot="list-search"
                            className="w-full min-w-0 sm:w-auto sm:flex-[0_1_320px]"
                        >
                            {search}
                        </div>
                    ) : null}
                    {filters ? (
                        <div
                            data-slot="list-filters"
                            className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
                        >
                            {filters}
                        </div>
                    ) : null}
                    {end || count ? (
                        <div
                            data-slot="list-end"
                            className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto"
                        >
                            {end}
                            {count ? (
                                <p
                                    data-slot="list-count"
                                    aria-live="polite"
                                    className="min-w-0 text-xs tabular-nums text-muted-foreground"
                                >
                                    {count}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {chips ? (
                <div data-slot="list-chips" className="min-w-0">
                    {chips}
                </div>
            ) : null}
        </div>
    );
}

/**
 * The trigger of a toolbar control that is not a flat list of options (a
 * picker with its own search): the same box as `ListFilter`'s.
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

/**
 * The one dropdown filter of a list toolbar, and its sort: an
 * `OptionSelect` as wide as its words, the search field's height, with the
 * same gap before its chevron whatever it says. `label` is its accessible
 * name ("Location", "Sort").
 */
export function ListFilter<V extends string>({
    label,
    value,
    onValueChange,
    options,
    footer,
    holdsData = false,
    className,
}: {
    label: string;
    value: V;
    onValueChange: (value: V) => void;
    options: readonly Option<V>[];
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
    return (
        <span
            data-list-filter=""
            data-ph-mask={holdsData ? "" : undefined}
            className="inline-flex min-w-0 max-w-full"
        >
            <OptionSelect
                aria-label={label}
                value={value}
                onValueChange={onValueChange}
                options={options}
                footer={footer}
                className={cn(listFilterClass, className)}
            />
        </span>
    );
}
