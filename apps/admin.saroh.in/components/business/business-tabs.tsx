"use client";

import type { CountTone } from "@saroh/ui/count-badge";
import { TabStrip } from "@saroh/ui/tabs";
import { useSelectedLayoutSegments } from "next/navigation";

/** A business page's tabs, in order (admin plan U2, R1). */
export const BUSINESS_TABS = [
    { id: "overview", label: "Overview" },
    { id: "modules", label: "Modules" },
    { id: "billing", label: "Billing" },
    { id: "website", label: "Website and payments" },
    { id: "team", label: "Team" },
    { id: "notes", label: "Notes" },
    { id: "history", label: "History" },
] as const;

export type BusinessTab = (typeof BUSINESS_TABS)[number]["id"];

/**
 * A tab's badge: a plain count, or "needs you" (`tone` strong or danger,
 * with `says`, "need you"). They come from the overview read (U3); until
 * then no tab carries one.
 */
export interface BusinessTabBadge {
    count: number | string | null;
    tone?: CountTone;
    says?: string;
}

/** Where a tab lives. Each is its own address, so Back and links work. */
export function businessTabHref(
    organizationId: string,
    tab: BusinessTab,
): string {
    return `/businesses/${encodeURIComponent(organizationId)}/${tab}`;
}

const isTab = (segment: string): segment is BusinessTab =>
    BUSINESS_TABS.some((t) => t.id === segment);

/**
 * The strip under a business's header: links, not client state. The open
 * tab is read from the address (route groups such as `(tabs)` are skipped),
 * so the layout that draws it needn't know. On a phone the strip scrolls
 * sideways.
 */
export function BusinessTabs({
    organizationId,
    badges = {},
}: {
    organizationId: string;
    badges?: Partial<Record<BusinessTab, BusinessTabBadge>>;
}) {
    const segments = useSelectedLayoutSegments();
    const active = segments.find(isTab) ?? "overview";
    return (
        <TabStrip
            label="Business sections"
            idPrefix="business-tab"
            value={active}
            className="mb-6"
            tabs={BUSINESS_TABS.map((t) => {
                const badge = badges[t.id];
                return {
                    value: t.id,
                    label: t.label,
                    href: businessTabHref(organizationId, t.id),
                    count: badge?.count,
                    countTone: badge?.tone,
                    countSays: badge?.says,
                };
            })}
        />
    );
}
