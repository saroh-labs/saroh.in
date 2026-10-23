"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { usePathname } from "next/navigation";

import type { AdminPermission } from "@/lib/control-plane";
import type { TeamTab } from "@/lib/team-words";
import { teamTabOf, teamTabsFor } from "@/lib/team-words";

/**
 * The Team screen's tabs (R30), each an address: Teammates · Console
 * roles · Payouts. Payouts only for `team:pay`.
 */
export function TeamTabs({ permissions }: { permissions: AdminPermission[] }) {
    const pathname = usePathname();
    return (
        <TabStrip<TeamTab>
            label="Team"
            idPrefix="team-tab"
            value={teamTabOf(pathname)}
            tabs={teamTabsFor(permissions).map((tab) => ({
                value: tab.id,
                label: tab.label,
                href: tab.href,
            }))}
        />
    );
}
