"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import Link from "next/link";
import * as React from "react";
import { cn } from "../../lib/utils";
import { chipClass } from "./chip";
import { ScrollX } from "./scroll-x";

/*
 * THE CHIP ROW: how a list is narrowed by status or kind.
 *
 * Tabs are for a screen's views (a different page, different columns).
 * Narrowing ONE list (All, Live, Scheduled, Ended) is this row of chips,
 * every time. It is a radio group: one tab stop, the arrows move the
 * choice. Where the choice is an address the server draws (every chip has
 * an `href`), the chips are links in a named group and the chosen one says
 * `aria-current`.
 *
 * ONE COUNT STYLE: the count follows the label as a quiet tabular number
 * ("Returning 9"). Leave it out when it isn't known; pass 0 when zero is
 * a fact. Never joined to the label with a dot, never a badge.
 *
 * On a phone the row is one line that scrolls sideways inside `ScrollX`
 * (the scroller the e2e sideways check allows), so the list starts where
 * the thumb is; from `sm` the chips wrap.
 */

export interface FilterChip<V extends string = string> {
    value: V;
    /** Saroh's own word for the subset: "Live", "Needs you". */
    label: string;
    /**
     * How many rows it holds. `undefined` or `null` draws nothing (not
     * known); 0 is drawn.
     */
    count?: number | null;
    /** Link mode: the address this choice is. Give every chip one. */
    href?: string;
    /**
     * The label is a record's own name (a location, a category), so a
     * session recording masks it.
     */
    holdsData?: boolean;
}

const figures = new Intl.NumberFormat("en-IN");

/** The quiet number after a chip's label. */
export function ChipCount({ count }: { count: number }) {
    return (
        <span data-chip-count="" className="tabular-nums opacity-70">
            {figures.format(count)}
        </span>
    );
}

/** The row: one line on a phone, wrapping from `sm`. */
const ROW =
    "flex min-w-0 items-center gap-1.5 p-1 max-sm:w-max max-sm:flex-nowrap sm:flex-wrap";

export interface FilterChipsProps<V extends string = string> {
    /** The group's accessible name: "Show", "Order status". */
    label: string;
    chips: readonly FilterChip<V>[];
    value: V;
    /** Leave out when every chip has an `href`. */
    onValueChange?: (value: V) => void;
    /**
     * On/off filters that follow the choice in the same row (`Chip
     * as="toggle"`): "Needs attention", "Late".
     */
    children?: React.ReactNode;
    className?: string;
}

export function FilterChips<V extends string = string>({
    label,
    chips,
    value,
    onValueChange,
    children,
    className,
}: FilterChipsProps<V>) {
    const links = chips.length > 0 && chips.every((c) => c.href !== undefined);
    // A chip's word is Saroh's own unless it names a record; its count is
    // a figure either way, which a recording hides by itself.
    const mark = (chip: FilterChip<V>) =>
        chip.holdsData ? { "data-ph-mask": "" } : { "data-ph-unmask": "" };
    const body = (chip: FilterChip<V>) => (
        <>
            {chip.label}
            {typeof chip.count === "number" ? (
                <>
                    {/* A real space: the gap is drawn by the chip, but the
                        name a screen reader hears is "Returning 9", not
                        "Returning9". */}{" "}
                    <ChipCount count={chip.count} />
                </>
            ) : null}
        </>
    );
    return (
        <ScrollX
            bare
            label={label}
            data-filter-chips=""
            // The row's own 4px of room, taken back here, so a chip's focus
            // ring is not clipped by the scroller.
            className={cn("-m-1", className)}
            current={links ? '[aria-current="true"]' : '[aria-checked="true"]'}
            revealKey={value}
        >
            <div className={ROW}>
                {links ? (
                    <div role="group" aria-label={label} className="contents">
                        {chips.map((chip) => (
                            <Link
                                key={chip.value}
                                href={chip.href ?? "#"}
                                scroll={false}
                                aria-current={
                                    chip.value === value ? "true" : undefined
                                }
                                {...mark(chip)}
                                className={chipClass(chip.value === value)}
                            >
                                {body(chip)}
                            </Link>
                        ))}
                    </div>
                ) : (
                    <RadioGroupPrimitive.Root
                        aria-label={label}
                        orientation="horizontal"
                        value={value}
                        onValueChange={(v) => onValueChange?.(v as V)}
                        className="contents"
                    >
                        {chips.map((chip) => (
                            <RadioGroupPrimitive.Item
                                key={chip.value}
                                value={chip.value}
                                {...mark(chip)}
                                className={chipClass(chip.value === value)}
                            >
                                {body(chip)}
                            </RadioGroupPrimitive.Item>
                        ))}
                    </RadioGroupPrimitive.Root>
                )}
                {children}
            </div>
        </ScrollX>
    );
}
