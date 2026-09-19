"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
    NavChild,
    NavCounts,
    NavRole,
} from "@/components/shared/nav-items";
import {
    NOTIFICATIONS_HREF,
    isNavItemActive,
    navFor,
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
    role = null,
    counts,
    sites = [],
}: {
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** The actor's role here; `null` = unknown, and the nav fails open. */
    role?: NavRole | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
    /** The merchant's own sites, hung under Website. */
    sites?: { id: string; name: string }[];
}) {
    const pathname = usePathname();
    const groups = navFor({ role, moduleKeys, sites });

    return (
        // `sticky top-0 h-screen` so the rail stays put on a long page. Without
        // it the aside is only as tall as the flex row, and navigation scrolls
        // away the moment a list runs past one viewport.
        <aside
            aria-label="Workspace"
            className="sticky top-0 hidden h-screen w-[238px] shrink-0 flex-col border-r lg:flex"
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
                className="flex flex-1 flex-col gap-px overflow-y-auto px-2.5 py-3"
            >
                {groups.map((group, index) => (
                    <div
                        key={group.label ?? `group-${index}`}
                        className={cn(
                            "flex flex-col gap-px",
                            // Space belongs to headings, not to every group.
                            showsGroupLabel(group) && "mt-4 first:mt-0",
                            group.separated &&
                                "mt-4 border-t border-border pt-4",
                        )}
                    >
                        {showsGroupLabel(group) && (
                            <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                {group.label}
                            </p>
                        )}
                        {group.items.map((item) => {
                            const active = isNavItemActive(pathname, item.href);
                            /*
                             * Only the DEEPEST match says "page" — and the
                             * deepest is now two levels down, since a site's
                             * Content and Settings sit beneath its name.
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
                                    (child) =>
                                        child.href === pathname ||
                                        (child.children ?? []).some(
                                            (leaf) => leaf.href === pathname,
                                        ),
                                ),
                            );
                            /*
                             * Two states, not one (brand file §13). The
                             * expanded parent is the SECTION you are in —
                             * Saffron label and icon, no surface. The row that
                             * is the PAGE you are on takes the white surface
                             * and the 2px Saffron marker. Never both.
                             */
                            const isPage = active && !childIsCurrent;
                            const isSection = active && childIsCurrent;
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
                                        "wk-nav flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors duration-fast",
                                        // The design system's ring, not
                                        // Chrome's default blue: the focus ring
                                        // is a keyboard user's cursor, and it
                                        // was inconsistent in exactly the place
                                        // navigation happens most.
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                        isPage
                                            ? "bg-card font-semibold text-foreground shadow-xs"
                                            : isSection
                                              ? "font-medium text-brand hover:bg-accent"
                                              : "font-medium text-foreground hover:bg-accent",
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" />
                                    <span className="flex-1">{item.label}</span>
                                    {waiting > 0 ? (
                                        /* The brand file's waiting count: a
                                           Saffron-tinted pill with 700 text.
                                           It is a count, not a status, so it
                                           does not borrow Warning's hue. */
                                        <span
                                            aria-label={`${waiting} waiting`}
                                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-subtle px-[7px] py-0.5 text-[11px] font-semibold tabular-nums text-brand-subtle-foreground"
                                        >
                                            {waiting}
                                        </span>
                                    ) : null}
                                </Link>
                            );
                        })}
                        {/* A section expands because you are in it, not
                            because you toggled it (brand file §13) — so the
                            children render only for the section you are in,
                            and there is no chevron. */}
                        {group.items.map((item) =>
                            item.children?.length &&
                            isNavItemActive(pathname, item.href) ? (
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
        <div className="mb-1 ml-[19px] mt-0.5 flex flex-col gap-px border-l border-border pl-2.5">
            {children.map((child) => {
                if (!child.href) {
                    // A label row: the site's name, with its destinations
                    // nested beneath. Not a link — see NavChild.href.
                    return (
                        <div
                            key={child.label}
                            className="flex flex-col gap-0.5"
                        >
                            <div className="truncate px-2.5 pt-1.5 text-[12.5px] font-medium text-foreground">
                                {child.label}
                            </div>
                            {child.children?.length ? (
                                <SiteTree
                                    children={child.children}
                                    pathname={pathname}
                                />
                            ) : null}
                        </div>
                    );
                }
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
                            // `wk-nav-child` stands the marker on the guide
                            // line rather than in the rail's gutter.
                            "wk-nav wk-nav-child truncate rounded-md px-2.5 py-[7px] text-[12.5px] font-medium transition-colors duration-fast",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            // Same weight either way: the surface and the
                            // marker say "current", so bolding the label would
                            // be a third signal.
                            active
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent-active",
                        )}
                    >
                        {child.create ? `+ ${child.label}` : child.label}
                    </Link>
                );
            })}
        </div>
    );
}
