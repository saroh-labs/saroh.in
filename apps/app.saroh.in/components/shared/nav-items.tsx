import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Briefcase,
    CalendarDays,
    Globe,
    Home,
    KanbanSquare,
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
    items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
    { items: [{ href: "/", label: "Home", icon: Home }] },
    {
        label: "Customers",
        items: [
            { href: "/contacts", label: "Contacts", icon: Users },
            { href: "/leads", label: "Leads", icon: Target },
            { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        ],
    },
    {
        label: "Appointments",
        items: [
            { href: "/services", label: "Services", icon: Briefcase },
            { href: "/bookings", label: "Bookings", icon: CalendarDays },
        ],
    },
    {
        label: "Website",
        items: [{ href: "/sites", label: "Sites", icon: Globe }],
    },
    {
        label: "Insights",
        items: [
            { href: "/analytics", label: "Analytics", icon: BarChart3 },
            { href: "/notifications", label: "Notifications", icon: Bell },
        ],
    },
];

/**
 * Active-route match: exact for the Home root (so it isn't lit on every page),
 * prefix for everything else (so detail routes keep their parent highlighted).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The Notifications item carries a live unread badge; identify it by route. */
export const NOTIFICATIONS_HREF = "/notifications";
