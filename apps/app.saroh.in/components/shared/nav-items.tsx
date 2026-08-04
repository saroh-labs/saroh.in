import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Blocks,
    Briefcase,
    Building2,
    CalendarClock,
    CalendarDays,
    Globe,
    Home,
    KanbanSquare,
    Plug,
    Store,
    Target,
    Users,
} from "lucide-react";

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * `AppSidebar`, the mobile `MobileNav` drawer and the command menu, so the three
 * can never drift. Home is an ungrouped anchor.
 *
 * Only routes that exist today are listed — no speculative destinations. The
 * proposed IA in `docs/product-transformation/information-architecture.md` §2
 * names sub-pages (Orders, Collections, Branding, Segments…) that have not been
 * built; listing them here would put 404s in the rail, which is the defect
 * `scripts/check-app-routes.mjs` now fails the build over.
 */
export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
}

export interface NavGroup {
    /** Uppercase group label; omitted for the ungrouped Home anchor. */
    label?: string;
    /**
     * The capability module this group belongs to (ADR-003). When set, the
     * group is shown only if that module is available for the actor; when
     * omitted, the group is always shown (core navigation).
     */
    moduleKey?: string;
    /** Render at the foot of the rail rather than in reading order. */
    pinToBottom?: boolean;
    items: NavItem[];
}

/**
 * A heading earns its line only when it groups something. "COMMERCE" above a
 * lone "Commerce" is the same word twice, and "WEBSITE" above "Sites" spends a
 * line to say less than the item already does — three of these cost six lines
 * of rail for three destinations. Single-item groups render as a bare item; the
 * `moduleKey` filtering above is unaffected either way.
 */
export function showsGroupLabel(group: NavGroup): boolean {
    return Boolean(group.label) && group.items.length > 1;
}

/**
 * Navigation, named for what the merchant came to do.
 *
 * Onboarding asks "What does your business need to do?" and the merchant answers
 * in outcomes — *Sell products*, *Take appointments*, *Show up online*. The shell
 * then discarded that vocabulary entirely and handed back module and entity
 * names — Commerce, Sites, Analytics — that nobody chose and nothing taught.
 * These labels are the onboarding answer, carried forward.
 *
 * Presentation only. No route, module key or schema changes: the same
 * capability gating applies, and every URL is untouched.
 *
 * Commerce leads, per the product decision of 2026-08-02 and
 * `information-architecture.md` §2 — Sell sits above Bookings.
 *
 * `Contacts` deliberately keeps its name. The unified customer record is not
 * built yet (SEC-005 / ARCH-001 are open), so calling it "All customers" would
 * promise a merge that has not happened — the same over-claim that was removed
 * from the marketing site.
 */
export const NAV_GROUPS: NavGroup[] = [
    { items: [{ href: "/", label: "Home", icon: Home }] },
    {
        label: "Sell",
        moduleKey: "COMMERCE",
        items: [{ href: "/commerce", label: "Sell", icon: Store }],
    },
    {
        label: "Bookings",
        moduleKey: "APPOINTMENTS",
        items: [
            // `/appointments` is the hub — "your schedule, services, and
            // availability" — so Schedule names it better than the module did.
            { href: "/appointments", label: "Schedule", icon: CalendarDays },
            { href: "/services", label: "Services", icon: Briefcase },
            // `/bookings` lists upcoming reservations grouped by day.
            { href: "/bookings", label: "Upcoming", icon: CalendarClock },
        ],
    },
    {
        label: "Customers",
        moduleKey: "CRM",
        items: [
            { href: "/contacts", label: "Contacts", icon: Users },
            { href: "/leads", label: "Leads", icon: Target },
            { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        ],
    },
    {
        label: "Website",
        moduleKey: "WEBSITE",
        items: [{ href: "/sites", label: "Website", icon: Globe }],
    },
    {
        label: "Insights",
        moduleKey: "INSIGHTS",
        items: [{ href: "/analytics", label: "Insights", icon: BarChart3 }],
    },
    // Notifications is core chrome (not a module), so it is always available.
    { items: [{ href: "/notifications", label: "Notifications", icon: Bell }] },
    // Settings is core chrome too — and it must never be module-gated, because
    // Settings → Modules is where a module gets turned on in the first place.
    // Both destinations degrade by role on the server (Modules is read-only for
    // non-managers; Providers renders an owners/admins-only empty state), so
    // showing them to every actor leaks nothing.
    // Pinned to the foot of the rail: configuration is where you go on purpose,
    // not something to scan past on the way to the work. It also keeps Settings
    // in the same place whether an Organization has one capability or eight.
    {
        label: "Settings",
        pinToBottom: true,
        items: [
            {
                href: "/settings/organization",
                label: "Organization",
                icon: Building2,
            },
            { href: "/settings/modules", label: "Modules", icon: Blocks },
            { href: "/settings/providers", label: "Providers", icon: Plug },
        ],
    },
];

/**
 * Project the nav to what an actor may see, given the module keys currently
 * available to them (a module is "available" when every capability gate passes,
 * i.e. its effective readiness is not DISABLED).
 *
 * Fail-open is reserved for genuine uncertainty. `null` means we could not find
 * out what is available (the modules fetch failed, or rollout flags are still
 * off) — the full nav is shown so the app is never emptied. An empty ARRAY is
 * different: it means we asked and the answer is "nothing is enabled yet", which
 * is the normal state of a brand-new Organization. Showing that merchant fifteen
 * destinations for capabilities they have not turned on advertises a workspace
 * they do not have, so we show only the always-on groups and let onboarding do
 * its job. Groups without a `moduleKey` (Home, Notifications) are always kept.
 */
export function filterNavGroups(
    groups: readonly NavGroup[],
    availableModuleKeys: readonly string[] | null,
): NavGroup[] {
    if (availableModuleKeys === null) return [...groups];
    const available = new Set(availableModuleKeys);
    return groups.filter(
        (group) => !group.moduleKey || available.has(group.moduleKey),
    );
}

/**
 * Active-route match: exact for the Home root (so it isn't lit on every page),
 * prefix for everything else (so detail routes keep their parent highlighted).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The Notifications item carries a live unread badge; identify it by route. */
export const NOTIFICATIONS_HREF = "/notifications";
