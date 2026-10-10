"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEdgeFade } from "@saroh/ui/scroll-x";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useRef } from "react";

export interface SectionItem<V extends string = string> {
    value: V;
    label: string;
    /** Link mode: the section is a page of its own. */
    href?: string;
    icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
    /** A line under the label saying what the section holds. */
    description?: string;
    /** Replaces the description while something there needs a person. */
    note?: string;
    /** Button mode: the panel this section shows. */
    controls?: string;
}

/**
 * The one vertical list of sections: Settings' side list and Website ›
 * Settings' groups. A column of rows; the open one sits on the muted
 * surface in semibold Ink. No Saffron marker: that is the menu's.
 *
 * Link mode (`href` on every item) is a `nav` whose open row says
 * `aria-current="page"`. Button mode is a vertical `tablist`: Up, Down, Home
 * and End move and open, and each row is `${idPrefix}-${value}` for its
 * panel's `aria-labelledby`.
 *
 * `phone="row"` turns the column into one row above the page below 760px,
 * scrolling sideways with the fade on the side with more and the open row
 * kept in view. `phone="hidden"` leaves the phone to the caller (a select).
 */
export function SectionList<V extends string = string>({
    label,
    heading,
    items,
    value,
    onValueChange,
    idPrefix = "section",
    phone = "row",
    className,
}: {
    /** The list's accessible name: "Settings", "Settings sections". */
    label: string;
    /** A small label over the column, at the desk. */
    heading?: ReactNode;
    items: readonly SectionItem<V>[];
    value: V | null;
    onValueChange?: (value: V) => void;
    idPrefix?: string;
    phone?: "row" | "hidden";
    className?: string;
}) {
    const links = items.every((i) => i.href !== undefined);
    const strip = useRef<HTMLDivElement>(null);
    const fade = useEdgeFade(strip, {
        current: links ? '[aria-current="page"]' : '[aria-selected="true"]',
        revealKey: value,
    });

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (links) return;
        const at = items.findIndex((i) => i.value === value);
        const n = items.length;
        const next =
            e.key === "ArrowDown"
                ? (at + 1) % n
                : e.key === "ArrowUp"
                  ? (at - 1 + n) % n
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? n - 1
                      : null;
        const to = next === null ? undefined : items[next];
        if (!to) return;
        e.preventDefault();
        onValueChange?.(to.value);
        document.getElementById(`${idPrefix}-${to.value}`)?.focus();
    };

    const rows = items.map((item) => {
        const on = item.value === value;
        const Icon = item.icon;
        const cls = cn(
            "flex shrink-0 cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 coarse:items-center",
            on
                ? "bg-muted font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent-active",
        );
        const line = on ? undefined : item.note;
        const body = (
            <>
                {Icon ? (
                    <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                ) : null}
                <span className="min-w-0 flex-1">
                    <span className="block">{item.label}</span>
                    {line ? (
                        <span className="mt-0.5 block text-pretty text-xs font-normal leading-[1.4] text-muted-foreground">
                            {line}
                        </span>
                    ) : item.description ? (
                        <span className="mt-0.5 hidden text-pretty text-xs font-normal leading-[1.4] text-muted-foreground min-[1100px]:block">
                            {item.description}
                        </span>
                    ) : null}
                </span>
            </>
        );
        return links ? (
            <Link
                key={item.value}
                id={`${idPrefix}-${item.value}`}
                href={item.href ?? "#"}
                aria-current={on ? "page" : undefined}
                className={cls}
            >
                {body}
            </Link>
        ) : (
            <button
                key={item.value}
                id={`${idPrefix}-${item.value}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={item.controls}
                tabIndex={on ? 0 : -1}
                onClick={() => onValueChange?.(item.value)}
                className={cls}
            >
                {body}
            </button>
        );
    });

    const shape = cn(
        phone === "row"
            ? "flex gap-1 overflow-x-auto [scrollbar-width:none] min-[760px]:flex-col min-[760px]:gap-0.5 min-[760px]:overflow-x-visible [&::-webkit-scrollbar]:hidden"
            : "hidden flex-col gap-0.5 lg:flex",
        className,
    );
    const head = heading ? (
        <p
            aria-hidden
            className="label hidden px-3 pb-2 pt-0.5 min-[760px]:block"
        >
            {heading}
        </p>
    ) : null;

    return links ? (
        <nav
            ref={strip}
            aria-label={label}
            data-scroll-x=""
            data-section-list=""
            style={fade}
            className={shape}
        >
            {head}
            {rows}
        </nav>
    ) : (
        <div
            ref={strip}
            role="tablist"
            aria-label={label}
            aria-orientation="vertical"
            data-section-list=""
            onKeyDown={onKeyDown}
            style={fade}
            className={shape}
        >
            {head}
            {rows}
        </div>
    );
}
