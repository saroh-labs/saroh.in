"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { usePathname } from "next/navigation";

import type { MemberTab } from "@/lib/team-member-words";
import {
    memberBase,
    memberTabOf,
    memberTabsFor,
} from "@/lib/team-member-words";

/**
 * A teammate's page's tabs, each an address (R33): Profile · Businesses ·
 * Leads (when the reader sees leads) · Earnings (`team:pay`) · Activity.
 */
export function MemberTabs({
    platformAdminId,
    seesLeads,
    pay,
    counts,
}: {
    platformAdminId: string;
    seesLeads: boolean;
    pay: boolean;
    counts: { businesses: number; openLeads: number };
}) {
    const pathname = usePathname();
    const base = memberBase(platformAdminId);
    return (
        <TabStrip<MemberTab>
            label="Teammate"
            idPrefix="member-tab"
            value={memberTabOf(pathname, base)}
            tabs={memberTabsFor({ seesLeads, pay }).map((tab) => ({
                value: tab.value,
                label: tab.label,
                href: tab.value === "profile" ? base : `${base}/${tab.value}`,
                count:
                    tab.value === "businesses"
                        ? counts.businesses
                        : tab.value === "leads"
                          ? counts.openLeads
                          : undefined,
            }))}
        />
    );
}
