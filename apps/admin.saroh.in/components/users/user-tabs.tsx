"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { usePathname } from "next/navigation";

import type { UserTab } from "@/lib/user-tabs";
import { USER_TABS, userTabOf } from "@/lib/user-tabs";

/** The user page's tabs, each an address (admin console U9, R13). */
export function UserTabs({ userId }: { userId: string }) {
    const pathname = usePathname();
    const base = `/users/${encodeURIComponent(userId)}`;
    return (
        <TabStrip<UserTab>
            label="User"
            value={userTabOf(pathname, base)}
            tabs={USER_TABS.map((tab) => ({
                value: tab.value,
                label: tab.label,
                href: tab.value === "overview" ? base : `${base}/${tab.value}`,
            }))}
        />
    );
}
