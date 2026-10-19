import type { LucideIcon } from "lucide-react";
import {
    Activity,
    Building2,
    Cable,
    CircleAlert,
    CloudUpload,
    Cog,
    Flag,
    HardDrive,
    Home,
    Mail,
    ReceiptText,
    Repeat,
    Rocket,
    ScrollText,
    ShieldCheck,
    Tags,
    Target,
    UserPlus,
    Users,
    Webhook,
} from "lucide-react";

import type { AdminPermission } from "@/lib/control-plane";

/**
 * The one nav source for the console: the rail and the drawer both read
 * this, so a screen cannot exist in one and not the other.
 *
 * Only screens that EXIST appear here. The console says what an operator can
 * actually do; a row that leads to a stub would be a promise it cannot keep.
 * Rows arrive as their unit lands
 * (`docs/plans/2026-09-23-001-feat-admin-console-plan.md`, and the redesign,
 * `docs/plans/2026-10-18-002-feat-admin-console-redesign-plan.md`).
 */

export interface ConsoleNavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    /** The staff permission that reaches it; absent means identity is enough. */
    permission?: AdminPermission;
}

export interface ConsoleNavGroup {
    /** Small caps heading. Announced on the icon rail, not drawn. */
    label: string;
    /** No heading at all: Home, which stands on its own above the groups. */
    plain?: boolean;
    items: ConsoleNavItem[];
}

/**
 * Home stands above the groups: it is where every staff member lands, and
 * what needs them is on it (admin console redesign U10, R14).
 */
const HOME: ConsoleNavItem = { href: "/", label: "Home", icon: Home };

/**
 * Grouped by the job the operator came to do (R15): helping a customer,
 * money, the product, and keeping Saroh running. Every screen the menu
 * reached before the redesign is still here, under a plain name: People is
 * Users at /users, Releases is /releases, and Health, which was the front
 * door, is /health (owner rule, 19 Oct: a redesign changes how screens look
 * and read, never what they can do).
 */
const GROUPS: ConsoleNavGroup[] = [
    {
        label: "Help customers",
        items: [
            {
                href: "/businesses",
                label: "Businesses",
                icon: Building2,
                permission: "organization:read",
            },
            {
                href: "/users",
                label: "Users",
                icon: Users,
                permission: "organization:pii:read",
            },
            {
                href: "/reports",
                label: "Reports",
                icon: Flag,
                permission: "organization:read",
            },
            {
                href: "/messages",
                label: "Messages",
                icon: Mail,
                permission: "organization:pii:read",
            },
            {
                href: "/waitlist",
                label: "Waitlist",
                icon: UserPlus,
                permission: "waitlist:read",
            },
            {
                // Saroh's own sales leads (DEC-169, U20). Account managers
                // reach their own board here.
                href: "/leads",
                label: "Leads",
                icon: Target,
                permission: "saroh-leads:read",
            },
        ],
    },
    {
        label: "Money",
        items: [
            {
                href: "/billing/subscriptions",
                label: "Subscriptions",
                icon: Repeat,
                permission: "saroh-billing:read",
            },
            {
                href: "/billing/invoices",
                label: "Invoices",
                icon: ReceiptText,
                permission: "saroh-billing:read",
            },
            {
                href: "/billing/actions",
                label: "Needs action",
                icon: CircleAlert,
                permission: "saroh-billing:read",
            },
            {
                href: "/billing/events",
                label: "Provider events",
                icon: Webhook,
                permission: "saroh-billing:read",
            },
        ],
    },
    {
        label: "Product",
        items: [
            {
                href: "/releases",
                label: "Releases",
                icon: Rocket,
                permission: "flags:read",
            },
            {
                href: "/plans",
                label: "Plans and modules",
                icon: Tags,
                permission: "pricing:read",
            },
            {
                href: "/usage",
                label: "Usage",
                icon: HardDrive,
                permission: "organization:read",
            },
        ],
    },
    {
        label: "Keep it running",
        items: [
            {
                href: "/health",
                label: "Health",
                icon: Activity,
                permission: "platform:read",
            },
            {
                href: "/operations/jobs",
                label: "Jobs",
                icon: Cog,
                permission: "jobs:read",
            },
            {
                href: "/operations/webhooks",
                label: "Webhooks",
                icon: Webhook,
                permission: "webhooks:read",
            },
            {
                href: "/operations/providers",
                label: "Providers",
                icon: Cable,
                permission: "providers:read",
            },
            {
                href: "/deployments",
                label: "Deployments",
                icon: CloudUpload,
                permission: "deployments:run",
            },
            {
                href: "/team",
                label: "Team",
                icon: ShieldCheck,
                permission: "staff:read",
            },
            {
                href: "/audit",
                label: "Audit trail",
                icon: ScrollText,
                permission: "audit:read",
            },
        ],
    },
];

/**
 * The groups this operator may reach. A group whose every item is refused is
 * dropped: a heading standing over nothing reads as something broken rather
 * than as something withheld.
 *
 * The rail and drawer call this themselves, from the permissions the server
 * hands them: they are client components, and a group carries its icon, which
 * is a component and cannot cross the server/client line.
 */
export function navFor(permissions: AdminPermission[]): ConsoleNavGroup[] {
    const home: ConsoleNavGroup = { label: "Home", plain: true, items: [HOME] };
    return [home, ...GROUPS]
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) =>
                    !item.permission || permissions.includes(item.permission),
            ),
        }))
        .filter((group) => group.items.length > 0);
}
