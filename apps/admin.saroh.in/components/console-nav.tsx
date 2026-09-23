import type { LucideIcon } from "lucide-react";
import { Building2, Gauge, Rocket, ScrollText } from "lucide-react";

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
            { href: "/", label: "Overview", icon: Gauge },
            {
                href: "/businesses",
                label: "Businesses",
                icon: Building2,
                permission: "organization:read",
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
