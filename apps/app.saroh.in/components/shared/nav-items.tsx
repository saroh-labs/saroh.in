import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Briefcase,
    CalendarClock,
    CalendarDays,
    Globe,
    Home,
    KanbanSquare,
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
];

/**
 * Project the nav to what an actor may see, given the module keys currently
 * available to them (a module is "available" when every capability gate passes,
 * i.e. its effective readiness is not DISABLED).
 *
 * Fail-open during dark rollout: when the capability system reports NO available
 * modules (rollout flags still off, or an Organization not yet backfilled), the
 * full nav is shown so the app is never emptied. Strict "disabled modules are
 * absent from operational nav" enforcement lands with the dark-rollout flip
 * (#117). Groups without a `moduleKey` (Home, Notifications) are always kept.
 */
export function filterNavGroups(
    groups: readonly NavGroup[],
    availableModuleKeys: readonly string[],
): NavGroup[] {
    if (availableModuleKeys.length === 0) return [...groups];
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
