"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { NavCounts } from "@/components/shared/nav-items";
import {
    NAV_GROUPS,
    NOTIFICATIONS_HREF,
    filterNavGroups,
    isNavItemActive,
    showsGroupLabel,
} from "@/components/shared/nav-items";

/**
 * Mobile/tablet primary navigation (< lg). The desktop `AppSidebar` is
 * `hidden lg:flex`, so this drawer is the ONLY nav below `lg`. It mirrors the
 * sidebar exactly — same goal groups, icons, and active state — so switching
 * breakpoints never changes the mental model. Closes on selection.
 */
export function MobileNav({
    unread = 0,
    moduleKeys = null,
    counts,
}: {
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
}) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const groups = filterNavGroups(NAV_GROUPS, moduleKeys);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation menu"
                    className="lg:hidden"
                >
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
                <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                    {/* Radix warns without one, and the warning is right: a
                        dialog announced as "Menu" and nothing else tells a
                        screen-reader user what they have just opened. */}
                    <SheetDescription className="sr-only">
                        Move between the sections of your workspace.
                    </SheetDescription>
                </SheetHeader>
                {/*
                 * Same grouping rhythm as `AppSidebar` — space above headings,
                 * a rule before Settings, lone items flowing tight — so the two
                 * navigations cannot drift into different mental models. The
                 * ROWS stay taller here: this one is driven by a thumb.
                 */}
                <nav
                    aria-label="Primary"
                    className="mt-6 flex flex-col gap-0.5"
                >
                    {groups.map((group, index) => (
                        <div
                            key={group.label ?? `group-${index}`}
                            className={cn(
                                "flex flex-col gap-0.5",
                                showsGroupLabel(group) && "mt-4 first:mt-0",
                                group.separated &&
                                    "mt-4 border-t border-border pt-4",
                            )}
                        >
                            {showsGroupLabel(group) && (
                                <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {group.label}
                                </p>
                            )}
                            {group.items.map((item) => {
                                const active = isNavItemActive(
                                    pathname,
                                    item.href,
                                );
                                const Icon = item.icon;
                                const waiting =
                                    item.href === NOTIFICATIONS_HREF
                                        ? unread
                                        : (counts?.[item.href] ?? 0);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        aria-current={
                                            active ? "page" : undefined
                                        }
                                        className={cn(
                                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                            active
                                                ? "bg-accent font-medium text-foreground"
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="flex-1">
                                            {item.label}
                                        </span>
                                        {waiting > 0 ? (
                                            /* Amber, matching the rail. `bg-primary`
                                               is the luminous ACTION colour in
                                               Panel and Instrument, so a count of
                                               things NOT yet done was rendering in
                                               the same green as the button you press
                                               when you are finished. */
                                            <span
                                                aria-label={`${waiting} waiting`}
                                                className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-warning/30 bg-warning-subtle px-1.5 text-xs font-medium tabular-nums text-warning-subtle-foreground"
                                            >
                                                {waiting}
                                            </span>
                                        ) : null}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    );
}
