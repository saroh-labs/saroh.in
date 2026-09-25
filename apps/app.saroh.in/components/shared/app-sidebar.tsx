"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@saroh/ui/popover";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useState, useSyncExternalStore } from "react";

import type {
    NavChild,
    NavCounts,
    NavRole,
} from "@/components/shared/nav-items";
import {
    isNavChildCurrent,
    isNavSectionActive,
    navCountFor,
    navFor,
    navPathname,
    showsGroupLabel,
} from "@/components/shared/nav-items";
import { rememberRail } from "@/lib/nav/rail-cookie";

/**
 * Primary navigation: a calm, goal-grouped rail.
 *
 * Three widths, as the workspace design sets them (brand file §21):
 * above 1100px the full 238px rail; from 760 to 1100 a 64px icon rail, where
 * labels, group headings and counts are announced but not drawn; below 760 no
 * rail at all — the phone `TabBar` and its sheet carry the same nav.
 *
 * A section's children are REMOVED on the icon rail rather than hidden, which
 * would leave controls in the tab order that nobody can see. They are reached
 * through a flyout on the parent instead, so the only path to a child screen
 * survives the collapse.
 *
 * Client-only for `usePathname` active state; the `unread` count is fetched
 * server-side by `AppShell` and passed in (this component never fetches).
 */

/**
 * Is the rail collapsed to icons? Only between the design's two boundaries:
 * below 760 there is no rail at all, and a flyout anchored to a control that
 * does not exist would float over the page.
 */
const ICON_RAIL = "(min-width: 760px) and (max-width: 1100px)";

function useIconRail(): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const mq = window.matchMedia(ICON_RAIL);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(ICON_RAIL).matches,
        // The server cannot know the width; the full rail is the honest
        // default, and the first client render corrects it.
        () => false,
    );
}
export function AppSidebar({
    unread = 0,
    moduleKeys = null,
    role = null,
    actions = null,
    counts,
    collapsed: collapsedAtLoad = false,
}: {
    /** The person collapsed the rail to icons; read from `RAIL_COOKIE`. */
    collapsed?: boolean;
    unread?: number;
    /** `null` = availability unknown; see `filterNavGroups`. */
    moduleKeys?: string[] | null;
    /** The actor's role here; `null` = unknown, and the nav fails open. */
    role?: NavRole | null;
    /**
     * What the actor may do, resolved by the API. Preferred over `role`, which
     * cannot describe a role the business invented.
     */
    actions?: readonly string[] | null;
    /** Work waiting behind a route; see `NavCounts`. */
    counts?: NavCounts;
}) {
    const groups = navFor({ role, actions, moduleKeys });
    const pathname = navPathname(usePathname(), groups);
    const [collapsed, setCollapsed] = useState(collapsedAtLoad);
    const [flyoutFor, setFlyoutFor] = useState<string | null>(null);
    // Icons, either because the window is narrow or because they asked.
    const iconRail = useIconRail() || collapsed;

    /** Collapse or expand, and remember it for this browser. */
    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        setFlyoutFor(null);
        rememberRail(next);
    };

    // Derived, not stored: a flyout only exists on the icon rail, so widening
    // the window closes it without a second render.
    const openFlyout = iconRail ? flyoutFor : null;

    return (
        // Sticky so the rail stays put on a long page. Without
        // it the aside is only as tall as the flex row, and navigation scrolls
        // away the moment a list runs past one viewport. Its nav scrolls on its
        // own when the rail is taller than the window, and `overscroll-contain`
        // keeps that scroll from running on into the page.
        <aside
            aria-label="Workspace"
            // Collapsed by choice draws exactly what the narrow window does:
            // every `max-[1100px]:` below has a `group-data-[collapsed]`
            // twin keyed on this attribute.
            data-collapsed={collapsed}
            // Below the 61px top bar, which carries the mark now.
            className="group/rail sticky top-[61px] hidden h-[calc(100vh-61px)] w-[238px] shrink-0 flex-col border-r data-[collapsed=true]:w-16 max-[1100px]:w-16 min-[760px]:flex print:hidden"
        >
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
                className="flex flex-1 flex-col gap-px overflow-y-auto overscroll-contain px-2.5 py-3 group-data-[collapsed=true]/rail:px-2 max-[1100px]:px-2"
            >
                {groups.map((group, index) => (
                    <Fragment key={group.label ?? `group-${index}`}>
                        {/*
                         * The pinned group's space is a spacer, not `mt-auto`:
                         * it grows to push Workspace to the foot of the rail,
                         * and keeps its 10px when the rail is full and scrolls.
                         */}
                        {group.pinToBottom && (
                            <div aria-hidden className="min-h-[10px] flex-1" />
                        )}
                        <div
                            className={cn(
                                "flex flex-col gap-px",
                                // Space belongs to headings, not to every group.
                                // The heading's own 12px of padding is the space
                                // above a group; the pinned group's spacer sits
                                // above its rule.
                                group.pinToBottom && "border-t border-border",
                            )}
                        >
                            {showsGroupLabel(group) && (
                                <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground group-data-[collapsed=true]/rail:sr-only max-[1100px]:sr-only">
                                    {group.label}
                                </p>
                            )}
                            {group.items.map((item) => {
                                const active = isNavSectionActive(
                                    pathname,
                                    item,
                                );
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
                                            isNavChildCurrent(
                                                pathname,
                                                child.href,
                                                item.children,
                                            ) ||
                                            (child.children ?? []).some(
                                                (leaf) =>
                                                    isNavChildCurrent(
                                                        pathname,
                                                        leaf.href,
                                                        child.children,
                                                    ),
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
                                const waiting = navCountFor(
                                    item.href,
                                    counts,
                                    unread,
                                );
                                const hasChildren = Boolean(
                                    item.children?.length,
                                );
                                const flyoutOpen = openFlyout === item.href;
                                return (
                                    <Fragment key={item.href}>
                                        <Popover
                                            open={flyoutOpen}
                                            onOpenChange={(open) => {
                                                if (!open) setFlyoutFor(null);
                                            }}
                                        >
                                            <PopoverAnchor asChild>
                                                <Link
                                                    href={item.href}
                                                    // On the icon rail a section opens its
                                                    // flyout instead of navigating: its
                                                    // children have no other path there.
                                                    onClick={(e) => {
                                                        if (
                                                            !iconRail ||
                                                            !hasChildren
                                                        )
                                                            return;
                                                        e.preventDefault();
                                                        setFlyoutFor(
                                                            flyoutOpen
                                                                ? null
                                                                : item.href,
                                                        );
                                                    }}
                                                    aria-expanded={
                                                        iconRail && hasChildren
                                                            ? flyoutOpen
                                                            : undefined
                                                    }
                                                    title={item.label}
                                                    aria-current={
                                                        active &&
                                                        !childIsCurrent
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    className={cn(
                                                        // Tighter rows than the drawer's: this
                                                        // rail is `lg`-and-up only, so it is
                                                        // always driven by a pointer, and the
                                                        // 44px touch target the tab bar needs
                                                        // would only spread twelve items over a
                                                        // screen's worth of height here.
                                                        // `wk-nav` grows a brand bar on the
                                                        // leading edge when this row is the
                                                        // current page (workspace.css). It
                                                        // scales from the centre rather than
                                                        // fading, so changing page reads as the
                                                        // marker travelling down the rail.
                                                        "wk-nav flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors duration-fast",
                                                        // The icon rail centres the glyph and
                                                        // drops the marker's gutter.
                                                        "max-[1100px]:justify-center max-[1100px]:px-0 max-[1100px]:before:hidden",
                                                        "group-data-[collapsed=true]/rail:justify-center group-data-[collapsed=true]/rail:px-0 group-data-[collapsed=true]/rail:before:hidden",
                                                        // The design system's ring, not
                                                        // Chrome's default blue: the focus ring
                                                        // is a keyboard user's cursor, and it
                                                        // was inconsistent in exactly the place
                                                        // navigation happens most.
                                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                                        isPage
                                                            ? "bg-card font-semibold text-foreground shadow-xs"
                                                            : isSection
                                                              ? "font-semibold text-brand hover:bg-accent"
                                                              : // Idle rows sit a step back
                                                                // from Ink, so the section and
                                                                // the page read louder.
                                                                "font-medium text-neutral-700 hover:bg-accent dark:text-muted-foreground",
                                                    )}
                                                >
                                                    <Icon
                                                        className="size-[19px] shrink-0"
                                                        strokeWidth={1.9}
                                                    />
                                                    <span className="flex-1 group-data-[collapsed=true]/rail:sr-only max-[1100px]:sr-only">
                                                        {item.label}
                                                    </span>
                                                    {waiting > 0 ? (
                                                        /* The brand file's waiting count: a
                                               Saffron-tinted pill with 700 text.
                                               It is a count, not a status, so it
                                               does not borrow Warning's hue. */
                                                        <span
                                                            aria-label={`${waiting} waiting`}
                                                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-subtle px-[7px] py-0.5 text-[11px] font-semibold tabular-nums text-brand-subtle-foreground group-data-[collapsed=true]/rail:sr-only max-[1100px]:sr-only"
                                                        >
                                                            {waiting}
                                                        </span>
                                                    ) : null}
                                                </Link>
                                            </PopoverAnchor>
                                            {item.children?.length ? (
                                                <NavFlyout
                                                    label={item.label}
                                                    children={item.children}
                                                    pathname={pathname}
                                                    onLeave={() =>
                                                        setFlyoutFor(null)
                                                    }
                                                    counts={counts}
                                                />
                                            ) : null}
                                        </Popover>
                                        {/* A section expands because you are in
                                        it, not because you toggled it (brand
                                        file §13) — so its screens render right
                                        under it, only for the section you are
                                        in, with no chevron. Removed outright on
                                        the icon rail, never hidden: invisible
                                        rows left in the tab order are the worse
                                        outcome. The flyout is their path at
                                        that width. */}
                                        {!iconRail && hasChildren && active ? (
                                            <SiteTree
                                                children={item.children ?? []}
                                                pathname={pathname}
                                                counts={counts}
                                            />
                                        ) : null}
                                    </Fragment>
                                );
                            })}
                        </div>
                    </Fragment>
                ))}
            </nav>
            {/*
             * Collapse to icons and back (2026-09-25). Only where the full
             * rail is drawn: below 1100px the rail is icons already, and a
             * button that did nothing would be a promise the rail can't keep.
             */}
            <div className="shrink-0 border-t border-border px-2.5 py-2 group-data-[collapsed=true]/rail:px-2 max-[1100px]:hidden">
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label={collapsed ? "Expand menu" : "Collapse menu"}
                    title={collapsed ? "Expand menu" : "Collapse menu"}
                    className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsed=true]/rail:justify-center group-data-[collapsed=true]/rail:px-0"
                >
                    {collapsed ? (
                        <PanelLeftOpen
                            aria-hidden
                            className="size-4 shrink-0"
                        />
                    ) : (
                        <PanelLeftClose
                            aria-hidden
                            className="size-4 shrink-0"
                        />
                    )}
                    <span className="group-data-[collapsed=true]/rail:sr-only">
                        {collapsed ? "Expand" : "Collapse"}
                    </span>
                </button>
            </div>
        </aside>
    );
}

/**
 * A section's screens, on the icon rail.
 *
 * An Ink popover anchored to the parent, because at 64px there is nowhere for
 * children to live — and unlike an accordion, nothing below it moves when it
 * opens. The current page keeps the 2px Saffron marker; on Ink it sits on a
 * Paper wash rather than white, which would vanish here (brand file §13).
 */
function NavFlyout({
    label,
    children,
    pathname,
    onLeave,
    counts,
}: {
    label: string;
    children: NavChild[];
    pathname: string;
    onLeave: () => void;
    /** Same counts the expanded rail draws — this is their only path at 64px. */
    counts?: NavCounts;
}) {
    const rows = children.filter(
        (child): child is NavChild & { href: string } => Boolean(child.href),
    );
    return (
        // Portalled, not absolute: the rail scrolls, and a box inside a
        // scroll container is clipped at its edge — which at 64px means the
        // flyout never appears at all.
        <PopoverContent
            side="right"
            align="start"
            // The design hangs it at x=60 against a 64px rail; the link stops
            // at 55 (8px of nav padding inside a 1px border), so 5px carries
            // it there.
            sideOffset={5}
            alignOffset={-4}
            aria-label={label}
            onMouseLeave={onLeave}
            // Focus stays on the rail: the flyout opens under the pointer and
            // its rows are reachable by Tab in order.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
                "w-[186px] rounded-[11px] border-0 p-[7px] shadow-lg",
                // Ink on Paper, as the design draws it. In dark mode Ink IS
                // the page, so it steps up to the Inset surface instead —
                // inverting to a Paper card would be the only white thing on
                // the screen.
                "bg-primary text-primary-foreground dark:bg-popover dark:text-popover-foreground",
            )}
        >
            <p className="px-[9px] pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">
                {label}
            </p>
            {rows.map((child) => {
                const on = isNavChildCurrent(pathname, child.href, rows);
                return (
                    <Link
                        key={child.href}
                        href={child.href}
                        onClick={onLeave}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "relative flex items-center rounded-[7px] py-2 pl-4 pr-3 text-[12.5px] transition-colors duration-fast",
                            "before:absolute before:left-1.5 before:top-1/2 before:h-[15px] before:w-0.5 before:-translate-y-1/2 before:rounded-[1px] before:bg-highlight before:transition-transform",
                            // A Paper wash over the Ink, never a white
                            // fill — which on this surface would read as a
                            // second card (brand file §13).
                            on
                                ? "bg-primary-foreground/[0.12] font-semibold dark:bg-foreground/10"
                                : "font-medium opacity-90 before:scale-y-0 hover:bg-primary-foreground/[0.09] hover:opacity-100 dark:hover:bg-foreground/[0.07]",
                        )}
                    >
                        <span className="min-w-0 flex-1 truncate">
                            {child.create ? `+ ${child.label}` : child.label}
                        </span>
                        {(counts?.[child.href] ?? 0) > 0 ? (
                            <span
                                aria-label={`${counts?.[child.href]} waiting`}
                                className="ml-2 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle px-[7px] py-0.5 text-[11px] font-semibold tabular-nums text-brand-subtle-foreground"
                            >
                                {counts?.[child.href]}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
        </PopoverContent>
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
    counts,
}: {
    children: NavChild[];
    pathname: string;
    /**
     * Work waiting behind a CHILD row.
     *
     * The count belongs to the screen that holds the work, not to the section
     * above it: "Sell 4" named a place, and a merchant had to guess which of
     * four screens the four were on. Sell's children now carry their own, and
     * the parent carries only what is genuinely its own.
     */
    counts?: NavCounts;
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
                                    counts={counts}
                                />
                            ) : null}
                        </div>
                    );
                }
                // Exact match, not prefix: `/sites/new` must not light up the
                // row for a site whose id happens to start the same way, and
                // the site rows are siblings of each other rather than nested.
                const active = isNavChildCurrent(
                    pathname,
                    child.href,
                    children,
                );
                const waiting = counts?.[child.href] ?? 0;
                return (
                    <Link
                        key={child.href}
                        href={child.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            // `wk-nav-child` stands the marker on the guide
                            // line rather than in the rail's gutter.
                            // `flex`, not `truncate` on the link itself: the
                            // label truncates and the count keeps its size,
                            // rather than a long label pushing the number out
                            // of the row.
                            "wk-nav wk-nav-child flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12.5px] font-medium transition-colors duration-fast",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            // Same weight either way: the surface and the
                            // marker say "current", so bolding the label would
                            // be a third signal.
                            active
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent-active",
                        )}
                    >
                        <span className="flex-1 truncate">
                            {child.create ? `+ ${child.label}` : child.label}
                        </span>
                        {waiting > 0 ? (
                            /* The same Saffron-tinted pill the parent rows
                               use — a count is a count wherever it sits, and
                               giving the child a second treatment would
                               suggest it meant something different. */
                            <span
                                aria-label={`${waiting} waiting`}
                                className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle px-[7px] py-0.5 text-[11px] font-semibold tabular-nums text-brand-subtle-foreground"
                            >
                                {waiting}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
        </div>
    );
}
