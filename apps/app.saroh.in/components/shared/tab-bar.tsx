"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavCounts, NavRole } from "@/components/shared/nav-items";
import { navFor } from "@/components/shared/nav-items";
import { TabBarSheet } from "@/components/shared/tab-bar-sheet";
import type { MobileTab } from "@/lib/nav/mobile-nav";
import { buildMobileNav } from "@/lib/nav/mobile-nav";

/**
 * The phone's navigation, below 760px (the "Saroh Tab Bar" design): four
 * tabs and More, fixed to the foot of the screen, where a thumb already is.
 *
 * It replaced a hamburger drawer. A drawer hides the whole workspace behind
 * one button, so a merchant on the shop floor opened it for every move; the
 * bar keeps the four places they go most one tap away and puts everything
 * else one tap further, in the More sheet.
 *
 * Built from `navFor` like the rail and the command menu, so role, permission
 * and module filtering are the same everywhere; `buildMobileNav` only decides
 * which rows get a seat. The shell pads its scroll container by
 * `--tab-bar-inset` (workspace.css) so nothing ends up underneath it.
 */
export function TabBar({
    unread = 0,
    moduleKeys = null,
    role = null,
    actions = null,
    counts,
}: {
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** The actor's role here; `null` = unknown, and the nav fails open. */
    role?: NavRole | null;
    /** What the actor may do, resolved by the API; preferred over `role`. */
    actions?: readonly string[] | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
}) {
    const pathname = usePathname();
    const nav = buildMobileNav({
        groups: navFor({ role, actions, moduleKeys }),
        pathname,
        counts,
        unread,
    });

    return (
        <nav
            aria-label="Main"
            className={cn(
                // Below the app's dialogs (z-50), so a dialog's scrim covers
                // the bar as it covers the page; above the sticky header.
                "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)]",
                "min-[760px]:hidden print:hidden",
            )}
        >
            {nav.tabs.map((tab) => (
                <TabLink key={tab.key} tab={tab} />
            ))}
            {nav.more ? (
                <TabBarSheet
                    groups={nav.groups}
                    note={nav.note}
                    trigger={(open) => (
                        // While the sheet is open, More takes the current
                        // style: it is where you are.
                        <button
                            type="button"
                            aria-label={tabLabel(
                                "More",
                                nav.more?.count ?? 0,
                                false,
                            )}
                            className={tabClass(open, false)}
                        >
                            <span className="relative">
                                <Ellipsis
                                    aria-hidden
                                    className="size-[21px]"
                                    strokeWidth={1.9}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <TabCount count={nav.more?.count ?? 0} />
                            </span>
                            <span className="max-w-full truncate">More</span>
                        </button>
                    )}
                />
            ) : null}
        </nav>
    );
}

/** A tab's accessible name: its label, what waits, and whether you are here. */
function tabLabel(label: string, count: number, current: boolean) {
    return `${label}${count > 0 ? `, ${count} waiting` : ""}${current ? ", current" : ""}`;
}

/**
 * The classes a tab and More share. `marked` draws the Saffron bar: a
 * current tab has it, and More open does not — it is emphasised, not the
 * page you are on.
 */
const tabClass = (on: boolean, marked = on) =>
    cn(
        // 52px tall, so the target clears 44px with its label under it.
        "flex min-h-[52px] min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[3px] border-0 bg-transparent px-0.5 py-1.5 text-[11px] leading-tight transition-colors duration-fast",
        // Inset: the bar runs to the screen's edge, where an outer ring
        // would be cut off.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        on
            ? "font-semibold text-foreground"
            : "font-medium text-muted-foreground",
        // The 2px Saffron bar along the tab's top edge.
        marked && "shadow-[inset_0_2px_0_hsl(var(--highlight))]",
    );

/** The count on a tab's icon: a Saffron fill, since it sits on the bar. */
function TabCount({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <span
            aria-hidden
            className="absolute -top-[5px] left-3 h-4 min-w-4 rounded-full bg-highlight px-1 text-center text-[11px] font-semibold tabular-nums leading-4 text-highlight-foreground"
        >
            {count}
        </span>
    );
}

function TabLink({ tab }: { tab: MobileTab }) {
    const Icon = tab.icon;
    return (
        <Link
            href={tab.href}
            aria-current={tab.current ? "page" : "false"}
            aria-label={tabLabel(tab.label, tab.count, tab.current)}
            className={cn(tabClass(tab.current), "no-underline")}
        >
            <span className="relative">
                <Icon
                    aria-hidden
                    className="size-[21px]"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <TabCount count={tab.count} />
            </span>
            <span className="max-w-full truncate">{tab.label}</span>
        </Link>
    );
}
