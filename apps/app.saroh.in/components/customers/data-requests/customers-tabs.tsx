import { TabStrip } from "@saroh/ui/tabs";

import { requestsHref } from "@/lib/customer-workspace/data-requests-view";

export type CustomersTab = "customers" | "requests";

/**
 * All · Requests under the Customers title (DEC-172, #1107), as Products'
 * tabs are drawn (`stores/catalogue/products-tabs.tsx`): "All", not
 * "Customers" again (owner, 27 Nov 2026). Links, so the inbox's notice can
 * open `?tab=requests`. Requests is shown only to whoever can
 * run a customer removal (`customer:remove`), with how many are open; a
 * count that couldn't be read is "—", never 0.
 */
export function CustomersTabs({
    active,
    openRequests,
}: {
    active: CustomersTab;
    /** Open requests; null when unknown, undefined while being read. */
    openRequests: number | null | undefined;
}) {
    return (
        <TabStrip
            label="Customers"
            value={active}
            tabs={[
                {
                    value: "customers",
                    label: "All",
                    href: "/commerce/customers",
                },
                {
                    value: "requests",
                    label: "Requests",
                    href: requestsHref(),
                    count: openRequests,
                    ...(openRequests
                        ? { countTone: "strong" as const, countSays: "open" }
                        : {}),
                },
            ]}
        />
    );
}
