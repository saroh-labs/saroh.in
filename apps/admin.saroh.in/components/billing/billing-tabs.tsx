"use client";

import type { TabItem } from "@saroh/ui/tabs";
import { TabStrip } from "@saroh/ui/tabs";
import { usePathname, useSearchParams } from "next/navigation";

import type { BillingTab } from "@/lib/billing-filters";
import { tabHref, tabOf } from "@/lib/billing-filters";
import type { BillingCounts } from "@/lib/billing-words";

const figures = new Intl.NumberFormat("en-IN");

/**
 * Subscriptions · Invoices · Needs action · Provider events (R25), each a
 * route, each with its count. The search goes with you from tab to tab;
 * each tab's own filters stay behind. Needs action's count is orange while
 * anything is open: it is the one that asks for someone. `counts` null:
 * they could not be read, so each says "—".
 */
export function BillingTabs({ counts }: { counts: BillingCounts | null }) {
    const pathname = usePathname();
    const params = useSearchParams();
    const query = { q: params.get("q") ?? undefined };
    const count = (key: keyof BillingCounts) => (counts ? counts[key] : null);
    const open = counts?.openActions ?? 0;

    const tabs: TabItem<BillingTab>[] = [
        {
            value: "subscriptions",
            label: "Subscriptions",
            href: tabHref("subscriptions", query),
            count: count("subscriptions"),
        },
        {
            value: "invoices",
            label: "Invoices",
            href: tabHref("invoices", query),
            count: count("invoices"),
        },
        {
            value: "actions",
            label: "Needs action",
            href: tabHref("actions", query),
            ...(open > 0
                ? {
                      extra: (
                          <span
                              data-attention=""
                              className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning-subtle px-1.5 text-[11px] font-semibold tabular-nums leading-5 text-warning-subtle-foreground"
                          >
                              {figures.format(open)}
                              <span className="sr-only"> open</span>
                          </span>
                      ),
                  }
                : { count: counts ? 0 : null }),
        },
        {
            value: "events",
            label: "Provider events",
            href: tabHref("events", query),
            count: count("events"),
        },
    ];

    return <TabStrip label="Billing" tabs={tabs} value={tabOf(pathname)} />;
}
