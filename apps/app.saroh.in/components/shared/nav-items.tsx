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
 * Single source of truth for the goal-based primary navigation, shared by the
 * desktop `AppSidebar` and the mobile `MobileNav` drawer so the two never drift.
 * Groups mirror the goals in `docs/design-system/02_INFORMATION_ARCHITECTURE.md`
 * (Customers / Appointments / Website / Insights); Home is an ungrouped anchor.
 * Only routes that exist today are listed — no speculative destinations.
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
    items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
    { items: [{ href: "/", label: "Home", icon: Home }] },
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
        label: "Appointments",
        moduleKey: "APPOINTMENTS",
        items: [
            {
                href: "/appointments",
                label: "Appointments",
                icon: CalendarDays,
            },
            { href: "/services", label: "Services", icon: Briefcase },
            { href: "/bookings", label: "Bookings", icon: CalendarClock },
        ],
    },
    {
        label: "Commerce",
        moduleKey: "COMMERCE",
        items: [{ href: "/commerce", label: "Commerce", icon: Store }],
    },
    {
        label: "Website",
        moduleKey: "WEBSITE",
        items: [{ href: "/sites", label: "Sites", icon: Globe }],
    },
    {
        label: "Insights",
        moduleKey: "INSIGHTS",
        items: [{ href: "/analytics", label: "Analytics", icon: BarChart3 }],
    },
    // Notifications is core chrome (not a module), so it is always available.
    { items: [{ href: "/notifications", label: "Notifications", icon: Bell }] },
    // Settings is core chrome too — and it must never be module-gated, because
    // Settings → Modules is where a module gets turned on in the first place.
    // Both destinations degrade by role on the server (Modules is read-only for
    // non-managers; Providers renders an owners/admins-only empty state), so
    // showing them to every actor leaks nothing.
    {
        label: "Settings",
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
