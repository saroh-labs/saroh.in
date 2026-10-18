"use client";

import { ListSearch } from "@saroh/ui/list-search";
import { ListFilter, ListToolbar } from "@saroh/ui/list-toolbar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { BillingTab, Query } from "@/lib/billing-filters";
import {
    clearHref,
    isNarrowed,
    searchHref,
    tabOf,
    withFilter,
} from "@/lib/billing-filters";
import type { BillingCounts } from "@/lib/billing-words";
import { monthLabel, recentMonths } from "@/lib/billing-words";

import { BillingTabs } from "./billing-tabs";

/** What the search box says, as the approved screen has it. */
export const BILLING_SEARCH_PLACEHOLDER =
    "Business, invoice no., sub_, cust_, pay_…";

/**
 * Billing's one toolbar (R25): the four tabs, ONE search for every tab,
 * and the open tab's dropdowns. Everything applies as it is picked, by
 * moving to the address that has it (`lib/billing-filters.ts`): there is no
 * Apply button, the month picker included. Typing settles after a pause and
 * replaces the address; a dropdown pushes one, so Back undoes it.
 */
export function BillingToolbar({ counts }: { counts: BillingCounts | null }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const query: Query = Object.fromEntries(params.entries());
    const tab = tabOf(pathname);
    const go = (href: string) => router.push(href, { scroll: false });
    const set = (change: Query) => go(withFilter(pathname, query, change));
    const narrowed = isNarrowed(tab, query);

    return (
        <ListToolbar
            tabs={<BillingTabs counts={counts} />}
            search={
                <ListSearch
                    // A new address from outside (a tab, Clear) resets it.
                    key={tab}
                    placeholder={BILLING_SEARCH_PLACEHOLDER}
                    describe="A business's name, an invoice number, or a Razorpay id: pay_, sub_, cust_ or order_."
                    defaultValue={query.q ?? ""}
                    onSearch={(term) => {
                        if (term === (query.q ?? "")) return;
                        router.replace(searchHref(pathname, query, term), {
                            scroll: false,
                        });
                    }}
                />
            }
            filters={<TabFilters tab={tab} query={query} set={set} />}
            onClear={narrowed ? () => go(clearHref(tab)) : undefined}
            clearLabel={
                narrowed && !hasTabFilter(tab, query)
                    ? "Clear search"
                    : "Clear filters"
            }
        />
    );
}

function hasTabFilter(tab: BillingTab, query: Query): boolean {
    return isNarrowed(tab, { ...query, q: undefined });
}

/** The open tab's own dropdowns. Subscriptions has its cards and chips. */
function TabFilters({
    tab,
    query,
    set,
}: {
    tab: BillingTab;
    query: Query;
    set: (change: Query) => void;
}) {
    if (tab === "invoices") {
        return (
            <>
                <ListFilter
                    label="Issued in"
                    value={query.month ?? ""}
                    onValueChange={(month) => set({ month })}
                    options={[
                        { value: "", label: "Every month" },
                        ...recentMonths(18).map((value) => ({
                            value,
                            label: monthLabel(value),
                        })),
                    ]}
                />
                <ListFilter
                    label="Buyer GSTIN"
                    value={query.gstin ?? ""}
                    onValueChange={(gstin) => set({ gstin })}
                    options={[
                        { value: "", label: "With or without a GSTIN" },
                        { value: "yes", label: "With a GSTIN" },
                        { value: "no", label: "Without a GSTIN" },
                    ]}
                />
            </>
        );
    }
    if (tab === "actions") {
        return (
            <ListFilter
                label="Open or resolved"
                value={query.state === "resolved" ? "resolved" : ""}
                onValueChange={(state) => set({ state })}
                options={[
                    { value: "", label: "Open" },
                    { value: "resolved", label: "Resolved" },
                ]}
            />
        );
    }
    if (tab === "events") {
        return (
            <ListFilter
                label="Show"
                value={query.filter ?? ""}
                onValueChange={(filter) => set({ filter })}
                options={[
                    { value: "", label: "Every event" },
                    { value: "not-applied", label: "Not applied" },
                    { value: "no-business", label: "No business" },
                ]}
            />
        );
    }
    return null;
}
