"use client";

import Link from "next/link";
import * as React from "react";
import { cn } from "../../lib/utils";

export interface SegmentedOption<V extends string = string> {
    value: V;
    label: React.ReactNode;
    /** Link mode: choosing this option is an address. */
    href?: string;
    /** A 16px glyph before the label. Decorative: the label names the option. */
    icon?: React.ReactNode;
    /** A tally after the label ("Open 4"). */
    count?: number;
    /** The option's accessible name, when the label is an icon alone. */
    name?: string;
    disabled?: boolean;
    /** On this option alone: hiding one below a width, say. */
    className?: string;
}

export interface SegmentedProps<V extends string = string> {
    /** What is being chosen: "View", "Discount type". */
    label: string;
    options: readonly SegmentedOption<V>[];
    value: V;
    /** Button mode. Leave out when every option has an `href`. */
    onValueChange?: (value: V) => void;
    /** `sm` (32px) for a toolbar, `md` (38px) beside a field. 44px on touch. */
    size?: "sm" | "md";
    /**
     * Fill the row, each option the same width. Without it the strip is as
     * wide as its words, under its label.
     */
    block?: boolean;
    disabled?: boolean;
    className?: string;
    id?: string;
    "aria-describedby"?: string;
    "aria-labelledby"?: string;
}

/*
 * The track is a block of its own, as wide as its options: `flex` with
 * `w-fit`, never `inline-flex`. Inline, it sat on the label's line when a
 * form put a label before it, and it stretched to the column in a grid or
 * a stacked form. Now it drops under its label and stays the size of its
 * words wherever it is placed, and `block` is the one way to fill the row.
 * On a narrow screen it is no wider than its parent and its options wrap.
 */
const TRACK =
    "flex w-fit max-w-full flex-wrap items-stretch gap-0.5 rounded-lg border border-border bg-muted p-0.5";
const SEGMENT =
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background coarse:h-11 coarse:px-3.5 [&_svg]:size-4 [&_svg]:shrink-0";
const SIZE = { sm: "h-7 text-[13px]", md: "h-[32px] text-sm" } as const;
// Selection is Ink, here as on a tab and a table row.
const ON =
    "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active";
const OFF =
    "text-muted-foreground hover:bg-card hover:text-foreground active:bg-accent-active";
const DISABLED =
    "disabled:pointer-events-none disabled:text-disabled-foreground";

/**
 * The one either/or control: Calendar · List, Day · Week · Agenda,
 * Percentage · Amount off. A grey track with the chosen option in Ink.
 *
 * In button mode it is a radio group: one tab stop, arrows move and choose.
 * In link mode (`href` on every option) it is a `nav` of links, each view
 * an address of its own, and the open one says `aria-current="page"`, as a
 * tab strip's links do.
 */
export function Segmented<V extends string = string>({
    label,
    options,
    value,
    onValueChange,
    size = "sm",
    block = false,
    disabled = false,
    className,
    id,
    ...aria
}: SegmentedProps<V>) {
    const links = options.every((o) => o.href !== undefined);
    const refs = React.useRef(new Map<string, HTMLButtonElement>());

    const onKeyDown = (e: React.KeyboardEvent) => {
        const open = options.filter((o) => !o.disabled);
        const at = open.findIndex((o) => o.value === value);
        const n = open.length;
        if (n === 0) return;
        const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
        const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
        const next = forward
            ? (at + 1) % n
            : back
              ? (at - 1 + n) % n
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? n - 1
                  : null;
        const to = next === null ? undefined : open[next];
        if (!to) return;
        e.preventDefault();
        onValueChange?.(to.value);
        refs.current.get(to.value)?.focus();
    };

    const inner = (o: SegmentedOption<V>) => (
        <>
            {o.icon ? <span aria-hidden>{o.icon}</span> : null}
            {o.label}
            {o.count === undefined ? null : (
                <span className="tabular-nums">{o.count}</span>
            )}
        </>
    );
    const cls = (on: boolean, own?: string) =>
        cn(SEGMENT, SIZE[size], block && "flex-1", on ? ON : OFF, own);
    // With nothing chosen yet, the first option holds the tab stop.
    const chosen = options.some((o) => o.value === value);

    const track = cn(TRACK, block && "w-full", className);
    const naming = aria["aria-labelledby"]
        ? { "aria-labelledby": aria["aria-labelledby"] }
        : { "aria-label": label };

    if (links) {
        return (
            <nav
                id={id}
                data-segmented=""
                {...naming}
                aria-describedby={aria["aria-describedby"]}
                className={track}
            >
                {options.map((o) => {
                    const on = o.value === value;
                    return (
                        <Link
                            key={o.value}
                            href={o.href ?? "#"}
                            scroll={false}
                            aria-current={on ? "page" : undefined}
                            data-state={on ? "on" : "off"}
                            aria-label={o.name}
                            className={cls(on, o.className)}
                        >
                            {inner(o)}
                        </Link>
                    );
                })}
            </nav>
        );
    }

    return (
        <div
            id={id}
            role="radiogroup"
            data-segmented=""
            {...naming}
            aria-describedby={aria["aria-describedby"]}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            className={track}
        >
            {options.map((o, i) => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        ref={(el) => {
                            if (el) refs.current.set(o.value, el);
                            else refs.current.delete(o.value);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-state={on ? "on" : "off"}
                        aria-label={o.name}
                        tabIndex={on || (!chosen && i === 0) ? 0 : -1}
                        disabled={disabled || o.disabled}
                        onClick={() => onValueChange?.(o.value)}
                        className={cn(cls(on, o.className), DISABLED)}
                    >
                        {inner(o)}
                    </button>
                );
            })}
        </div>
    );
}
