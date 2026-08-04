"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavCounts } from "@/components/shared/nav-items";
import {
    NAV_GROUPS,
    NOTIFICATIONS_HREF,
    filterNavGroups,
    isNavItemActive,
    showsGroupLabel,
} from "@/components/shared/nav-items";

/**
 * Desktop primary navigation: a calm, goal-grouped rail replacing the flat
 * horizontal top nav (see `docs/design-system/03_APPLICATION_SHELL.md`). It is
 * `hidden lg:flex` — below `lg` the same nav lives in `MobileNav`'s drawer.
 * Client-only for `usePathname` active state; the `unread` count is fetched
 * server-side by `AppShell` and passed in (this component never fetches).
 */
export function AppSidebar({
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
    const pathname = usePathname();
    const groups = filterNavGroups(NAV_GROUPS, moduleKeys);

    return (
        // `sticky top-0 h-screen` so the rail stays put on a long page. Without
        // it the aside is only as tall as the flex row, and navigation scrolls
        // away the moment a list runs past one viewport.
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex">
            <div className="flex h-14 items-center border-b px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
            </div>
            <nav
                aria-label="Primary"
                className="flex flex-1 flex-col gap-6 overflow-y-auto p-4"
            >
                {groups.map((group, index) => (
                    <div
                        key={group.label ?? `group-${index}`}
                        className={cn(
                            "flex flex-col gap-1",
                            group.pinToBottom && "mt-auto",
                        )}
                    >
                        {showsGroupLabel(group) && (
                            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {group.label}
                            </p>
                        )}
                        {group.items.map((item) => {
                            const active = isNavItemActive(pathname, item.href);
                            const Icon = item.icon;
                            // Notifications counts unread; everything else
                            // counts work waiting. Both mean "something here
                            // wants you", so both are drawn the same way.
                            const waiting =
                                item.href === NOTIFICATIONS_HREF
                                    ? unread
                                    : (counts?.[item.href] ?? 0);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                        active
                                            ? "bg-accent font-medium text-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="flex-1">{item.label}</span>
                                    {waiting > 0 ? (
                                        /* Amber, not `bg-primary`. In the Panel
                                           and Instrument skins `--primary` is the
                                           luminous ACTION colour, so a count of
                                           things you have not done yet was
                                           rendering in the same green as the
                                           button you press when you are done —
                                           and outshouting it. Amber is the
                                           workspace's "someone is waiting". */
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
        </aside>
    );
}
