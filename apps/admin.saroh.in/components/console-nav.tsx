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
 * The one nav source for the console: the rail, the drawer and (later) the
 * command menu all read this, so a screen cannot exist in one and not another.
 *
 * Only screens that EXIST appear here. The console says what an operator can
 * actually do on this instance; a row that leads to a stub would be a promise
 * the instance cannot keep. Rows arrive as their unit lands
 * (`docs/plans/2026-09-23-001-feat-admin-console-plan.md`).
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
    items: ConsoleNavItem[];
}

const GROUPS: ConsoleNavGroup[] = [
    {
        label: "Instance",
        items: [
            { href: "/", label: "Health", icon: Activity },
            {
                href: "/businesses",
                label: "Businesses",
                icon: Building2,
                permission: "organization:read",
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
                href: "/usage",
                label: "Usage",
                icon: HardDrive,
                permission: "organization:read",
            },
            {
                href: "/people",
                label: "People",
                icon: Users,
                permission: "organization:pii:read",
            },
            {
                href: "/plans",
                label: "Plans and modules",
                icon: Tags,
                permission: "pricing:read",
            },
            {
                href: "/flags",
                label: "Releases",
                icon: Rocket,
                permission: "flags:read",
            },
            {
                href: "/audit",
                label: "Audit trail",
                icon: ScrollText,
                permission: "audit:read",
            },
        ],
    },
    {
        label: "Billing",
        items: [
            {
                href: "/billing/invoices",
                label: "Invoices",
                icon: ReceiptText,
                permission: "saroh-billing:read",
            },
            {
                href: "/billing/subscriptions",
                label: "Subscriptions",
                icon: Repeat,
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
        label: "Operations",
        items: [
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
        ],
    },
    {
        label: "Access",
        items: [
            {
                href: "/team",
                label: "Team",
                icon: ShieldCheck,
                permission: "staff:read",
            },
            {
                // Saroh's own sales leads (DEC-169, U20). Account managers
                // reach their own board here.
                href: "/leads",
                label: "Leads",
                icon: Target,
                permission: "saroh-leads:read",
            },
            {
                href: "/waitlist",
                label: "Waitlist",
                icon: UserPlus,
                permission: "waitlist:read",
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
    return GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
            (item) => !item.permission || permissions.includes(item.permission),
        ),
    })).filter((group) => group.items.length > 0);
}
