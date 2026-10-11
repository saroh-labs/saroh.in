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

/** A line of chips: one line on a phone, wrapping from `sm`. */
const LINE =
    "flex min-w-0 items-center gap-1.5 max-sm:flex-nowrap sm:flex-wrap";
/** The row inside the scroller, with room for a chip's focus ring. */
const ROW = `${LINE} p-1 max-sm:w-max`;

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
    const group = (className: string) =>
        links ? (
            <div role="group" aria-label={label} className={className}>
                {chips.map((chip) => (
                    <Link
                        key={chip.value}
                        href={chip.href ?? "#"}
                        scroll={false}
                        aria-current={chip.value === value ? "true" : undefined}
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
                className={className}
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
        );
    return (
        <ScrollX
            bare
            label={label}
            data-filter-chips=""
            // The row keeps 4px of room all round, so a chip's focus ring
            // is not clipped by the scroller. That room is taken back
            // above, below and on the left, where a box may reach past
            // its parent without making anything wider. Never on the
            // right: 4px past a parent that clips is 4px hidden sideways.
            className={cn("-my-1 -ml-1", className)}
            current={links ? '[aria-current="true"]' : '[aria-checked="true"]'}
            revealKey={value}
        >
            {children ? (
                // The choice is a real box of its own (never
                // `display: contents`, which some browsers drop from the
                // accessibility tree), and the on/off filters follow it.
                <div className={ROW}>
                    {group(LINE)}
                    {children}
                </div>
            ) : (
                group(ROW)
            )}
        </ScrollX>
    );
}
