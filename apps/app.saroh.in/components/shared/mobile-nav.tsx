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
    navGroupsWithSites,
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
    sites = [],
    organizationName,
}: {
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
    /** The merchant's own sites, hung under Website — same tree as the rail. */
    sites?: { id: string; name: string }[];
    /** The workspace this nav belongs to; see the header below. */
    organizationName?: string;
}) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const groups = filterNavGroups(
        navGroupsWithSites(NAV_GROUPS, sites),
        moduleKeys,
    );

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
                {/*
                 * The workspace is named here because on a phone it is named
                 * NOWHERE else (#178). The header's org switcher truncates to
                 * its chevron once the controls are sized for a thumb, so a
                 * merchant who belongs to two organizations had no way to tell
                 * which one they were looking at without opening a menu that
                 * then said "Menu". This is the screen they open to orient
                 * themselves, and it has the room the header does not.
                 */}
                <SheetHeader className="text-left">
                    <SheetTitle>{organizationName ?? "Menu"}</SheetTitle>
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
                                /*
                                 * Only the DEEPEST match says "page". The
                                 * parent matches by prefix, so on /sites/new it
                                 * and the child row both claimed
                                 * aria-current="page" and a screen reader
                                 * announced two current pages. The parent still
                                 * LOOKS active — it is the section you are in —
                                 * but the child is the page you are on.
                                 */
                                const childIsCurrent = Boolean(
                                    item.children?.some(
                                        (child) =>
                                            child.href === pathname ||
                                            (child.children ?? []).some(
                                                (leaf) =>
                                                    leaf.href === pathname,
                                            ),
                                    ),
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
                                            active && !childIsCurrent
                                                ? "page"
                                                : undefined
                                        }
                                        className={cn(
                                            // `wk-nav` is the same leading-edge
                                            // marker the rail carries
                                            // (workspace.css). Below `lg` this
                                            // drawer is the ONLY navigation, so
                                            // without it the active page loses
                                            // the one cue the desktop nav uses
                                            // to say where you are — and the
                                            // two navigations are meant to be
                                            // the same mental model.
                                            "wk-nav flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
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
                            {group.items.map((item) =>
                                item.children?.length ? (
                                    <div
                                        key={`${item.href}-children`}
                                        className="ml-6 flex flex-col gap-1 border-l border-border pl-2"
                                    >
                                        {item.children.map((child) =>
                                            !child.href ? (
                                                <div
                                                    key={child.label}
                                                    className="flex flex-col gap-1"
                                                >
                                                    <div className="truncate px-3 pt-2 text-sm font-medium text-foreground">
                                                        {child.label}
                                                    </div>
                                                    <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
                                                        {(
                                                            child.children ?? []
                                                        ).map((leaf) => (
                                                            <Link
                                                                key={leaf.href}
                                                                href={
                                                                    leaf.href ??
                                                                    "#"
                                                                }
                                                                onClick={() =>
                                                                    setOpen(
                                                                        false,
                                                                    )
                                                                }
                                                                aria-current={
                                                                    pathname ===
                                                                    leaf.href
                                                                        ? "page"
                                                                        : undefined
                                                                }
                                                                className={cn(
                                                                    "truncate rounded-md px-3 py-2.5 text-sm transition-colors",
                                                                    pathname ===
                                                                        leaf.href
                                                                        ? "bg-accent font-medium text-foreground"
                                                                        : "text-muted-foreground active:bg-accent",
                                                                )}
                                                            >
                                                                {leaf.label}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <Link
                                                    key={child.href}
                                                    href={child.href}
                                                    onClick={() =>
                                                        setOpen(false)
                                                    }
                                                    aria-current={
                                                        pathname === child.href
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    /*
                                                     * Taller rows than the rail's,
                                                     * as every row in this drawer
                                                     * is: this one is driven by a
                                                     * thumb, and a 26px site name
                                                     * is a miss waiting to happen.
                                                     */
                                                    className={cn(
                                                        "truncate rounded-md px-3 py-2.5 text-sm transition-colors",
                                                        pathname === child.href
                                                            ? "bg-accent font-medium text-foreground"
                                                            : "text-muted-foreground active:bg-accent",
                                                        child.create &&
                                                            "text-muted-foreground/70",
                                                    )}
                                                >
                                                    {child.create
                                                        ? `+ ${child.label}`
                                                        : child.label}
                                                </Link>
                                            ),
                                        )}
                                    </div>
                                ) : null,
                            )}
                        </div>
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    );
}
