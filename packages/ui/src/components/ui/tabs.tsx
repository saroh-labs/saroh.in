"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import * as React from "react";
import { cn } from "../../lib/utils";
import type { CountTone } from "./count-badge";
import { CountBadge } from "./count-badge";
import { ScrollX } from "./scroll-x";

/*
 * ONE TAB LOOK: the underline strip.
 *
 * Ink underline on the open tab, 14px, an optional count, one line however
 * narrow (it scrolls sideways inside `ScrollX`, which fades the side with
 * more and says so once), 44px under a thumb. Never Saffron: that is the
 * menu's current-page marker.
 *
 * `TabStrip` is what a screen uses. It takes the tabs as data and draws them
 * as links (`href`: the tab is an address, the server reads it) or as
 * buttons (`onValueChange`: the tab is state). The Radix parts below it
 * (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) draw the same strip
 * with `variant="underline"` for a caller that wants Radix to own the
 * panels; their default look is the admin console's.
 */

/** The strip's row, and one tab in it. Shared by both ways of drawing it. */
const STRIP = "flex min-w-max flex-nowrap items-stretch gap-0.5";
const TAB =
    "inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11";
const TAB_ON =
    "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]";
const TAB_OFF =
    "font-medium text-muted-foreground hover:text-foreground active:bg-accent-active";

export interface TabItem<V extends string = string> {
    value: V;
    label: React.ReactNode;
    /** Link mode: where this tab lives. */
    href?: string;
    /**
     * Shown after the label. `null` is a count that could not be read ("—");
     * leave it out for no count at all.
     */
    count?: number | string | null;
    countTone?: CountTone;
    /** Button mode: the panel this tab shows (`aria-controls`). */
    controls?: string;
    /** Drawn after the label and count, such as a dot for unsaved changes. */
    extra?: React.ReactNode;
    /** A rule before this tab, setting it apart from the ones before it. */
    separated?: boolean;
    disabled?: boolean;
}

export interface TabStripProps<V extends string = string> {
    /** The strip's accessible name: "Orders", "Business details". */
    label: string;
    tabs: readonly TabItem<V>[];
    value: V;
    /** Button mode. Leave out when every tab has an `href`. */
    onValueChange?: (value: V) => void;
    /** Each tab's id is `${idPrefix}-${value}`, for a panel's `aria-labelledby`. */
    idPrefix?: string;
    /** On the outer box: margins, and a gutter the strip should bleed into. */
    className?: string;
    /** On the row of tabs: its own side padding. */
    listClassName?: string;
}

/**
 * A screen's tabs. Link mode is a `nav` whose open tab says
 * `aria-current="page"`; button mode is a `tablist` with the ARIA tabs
 * keyboard (arrows, Home, End move and open).
 */
export function TabStrip<V extends string = string>({
    label,
    tabs,
    value,
    onValueChange,
    idPrefix,
    className,
    listClassName,
}: TabStripProps<V>) {
    const generated = React.useId();
    const prefix = idPrefix ?? `tabs-${generated}`;
    const links = tabs.every((t) => t.href !== undefined);
    const idOf = (v: string) => `${prefix}-${v}`;

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (links) return;
        const open = tabs.filter((t) => !t.disabled);
        const at = open.findIndex((t) => t.value === value);
        const n = open.length;
        const next =
            e.key === "ArrowRight"
                ? (at + 1) % n
                : e.key === "ArrowLeft"
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
        document.getElementById(idOf(to.value))?.focus();
    };

    const body = (t: TabItem<V>, on: boolean) => (
        <>
            {t.label}
            {t.count === undefined ? null : (
                <CountBadge count={t.count} tone={t.countTone} on={on} />
            )}
            {t.extra}
        </>
    );

    const items = tabs.map((t) => {
        const on = t.value === value;
        const cls = cn(TAB, on ? TAB_ON : TAB_OFF);
        return (
            <React.Fragment key={t.value}>
                {t.separated ? (
                    <span
                        aria-hidden
                        className="mx-1.5 h-5 w-px shrink-0 self-center bg-border"
                    />
                ) : null}
                {links ? (
                    <Link
                        id={idOf(t.value)}
                        href={t.href ?? "#"}
                        scroll={false}
                        aria-current={on ? "page" : undefined}
                        className={cls}
                    >
                        {body(t, on)}
                    </Link>
                ) : (
                    <button
                        id={idOf(t.value)}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-controls={t.controls}
                        tabIndex={on ? 0 : -1}
                        disabled={t.disabled}
                        onClick={() => onValueChange?.(t.value)}
                        className={cn(
                            cls,
                            "disabled:pointer-events-none disabled:text-disabled-foreground",
                        )}
                    >
                        {body(t, on)}
                    </button>
                )}
            </React.Fragment>
        );
    });

    return (
        <ScrollX
            bare
            label={label}
            data-tab-strip=""
            className={cn("border-b border-border", className)}
            current={links ? '[aria-current="page"]' : '[aria-selected="true"]'}
            revealKey={value}
        >
            {links ? (
                <nav aria-label={label} className={cn(STRIP, listClassName)}>
                    {items}
                </nav>
            ) : (
                <div
                    role="tablist"
                    aria-label={label}
                    onKeyDown={onKeyDown}
                    className={cn(STRIP, listClassName)}
                >
                    {items}
                </div>
            )}
        </ScrollX>
    );
}

type TabsVariant = "pill" | "underline";
const VariantContext = React.createContext<TabsVariant>("pill");

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
        variant?: TabsVariant;
    }
>(({ className, variant = "pill", ...props }, ref) => (
    <VariantContext.Provider value={variant}>
        <TabsPrimitive.List
            ref={ref}
            className={cn(
                variant === "underline"
                    ? "flex flex-nowrap items-stretch gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    : "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
                className,
            )}
            {...props}
        />
    </VariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
    const variant = React.useContext(VariantContext);
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            className={cn(
                variant === "underline"
                    ? cn(
                          TAB,
                          "font-medium text-muted-foreground hover:text-foreground active:bg-accent-active disabled:pointer-events-none disabled:text-disabled-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--foreground))]",
                      )
                    : "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active disabled:pointer-events-none disabled:text-disabled-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                className,
            )}
            {...props}
        />
    );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.Content
        ref={ref}
        className={cn(
            "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
        )}
        {...props}
    />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
