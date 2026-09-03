"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavChild, NavCounts } from "@/components/shared/nav-items";
import {
    NAV_GROUPS,
    NOTIFICATIONS_HREF,
    filterNavGroups,
    isNavItemActive,
    navGroupsWithSites,
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
    sites = [],
}: {
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
    /** The merchant's own sites, hung under Website. */
    sites?: { id: string; name: string }[];
}) {
    const pathname = usePathname();
    const groups = filterNavGroups(
        navGroupsWithSites(NAV_GROUPS, sites),
        moduleKeys,
    );

    return (
        // `sticky top-0 h-screen` so the rail stays put on a long page. Without
        // it the aside is only as tall as the flex row, and navigation scrolls
        // away the moment a list runs past one viewport.
        <aside
            aria-label="Workspace"
            className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex"
        >
            <div className="flex h-14 items-center border-b px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
            </div>
            {/*
             * `gap-0.5` on the nav, and space bought back only where it means
             * something.
             *
             * The rail used to put a full `gap-6` between every group — but five
             * of them (Home, Sell, Website, Insights, Notifications) hold a
             * single item each, so 120px of the rail was gaps around lone rows,
             * separating things that were never in different categories. A
             * heading earns the space above it; a lone item does not.
             */}
            <nav
                aria-label="Primary"
                className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4"
            >
                {groups.map((group, index) => (
                    <div
                        key={group.label ?? `group-${index}`}
                        className={cn(
                            "flex flex-col gap-0.5",
                            // Space belongs to headings, not to every group.
                            showsGroupLabel(group) && "mt-4 first:mt-0",
                            group.separated &&
                                "mt-4 border-t border-border pt-4",
                        )}
                    >
                        {showsGroupLabel(group) && (
                            <p className="px-2.5 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.label}
                            </p>
                        )}
                        {group.items.map((item) => {
                            const active = isNavItemActive(pathname, item.href);
                            /*
                             * Only the DEEPEST match says "page".
                             *
                             * The parent matches by prefix, so on /sites/new
                             * both it and the child row claimed
                             * aria-current="page" and a screen reader
                             * announced two current pages. The parent still
                             * LOOKS active — it is the section you are in —
                             * but the child is the page you are on.
                             */
                            const childIsCurrent = Boolean(
                                item.children?.some(
                                    (child) => child.href === pathname,
                                ),
                            );
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
                                    aria-current={
                                        active && !childIsCurrent
                                            ? "page"
                                            : undefined
                                    }
                                    className={cn(
                                        // Tighter rows than the drawer's: this
                                        // rail is `lg`-and-up only, so it is
                                        // always driven by a pointer, and the
                                        // 44px touch target that MobileNav needs
                                        // would only spread twelve items over a
                                        // screen's worth of height here.
                                        // `wk-nav` grows a brand bar on the
                                        // leading edge when this row is the
                                        // current page (workspace.css). It
                                        // scales from the centre rather than
                                        // fading, so changing page reads as the
                                        // marker travelling down the rail.
                                        "wk-nav flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                        // The design system's ring, not
                                        // Chrome's default blue: the focus ring
                                        // is a keyboard user's cursor, and it
                                        // was inconsistent in exactly the place
                                        // navigation happens most.
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                        active
                                            ? "bg-accent font-medium text-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" />
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
                        {group.items.map((item) =>
                            item.children?.length ? (
                                <SiteTree
                                    key={`${item.href}-children`}
                                    children={item.children}
                                    pathname={pathname}
                                />
                            ) : null,
                        )}
                    </div>
                ))}
            </nav>
        </aside>
    );
}

/**
 * The merchant's own things, nested under the destination that owns them.
 *
 * Indented and unadorned: a child is identified by its NAME, and a column of
 * identical globes under Website would spend an icon each to say the same word
 * three times. The indent and the rule do the nesting instead.
 *
 * Every row is a real route. `nav-items.tsx` states that only routes that exist
 * may be listed and `scripts/check-app-routes.mjs` fails the build over a nav
 * entry that 404s — these point at `/sites/<id>` and `/sites/new`, both of
 * which ship today, which is exactly why pages are not nested here as well.
 */
function SiteTree({
    children,
    pathname,
}: {
    children: NavChild[];
    pathname: string;
}) {
    return (
        <div className="ml-[1.0625rem] flex flex-col gap-0.5 border-l border-border pl-2">
            {children.map((child) => {
                // Exact match, not prefix: `/sites/new` must not light up the
                // row for a site whose id happens to start the same way, and
                // the site rows are siblings of each other rather than nested.
                const active = pathname === child.href;
                return (
                    <Link
                        key={child.href}
                        href={child.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "wk-nav truncate rounded-md px-2.5 py-1 text-[0.8125rem] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                                ? "bg-accent font-medium text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent",
                            // Creating is a different kind of act from opening,
                            // and reads quieter so the sites themselves stay
                            // the thing the eye lands on.
                            child.create && "text-muted-foreground/70",
                        )}
                    >
                        {child.create ? `+ ${child.label}` : child.label}
                    </Link>
                );
            })}
        </div>
    );
}
