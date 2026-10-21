import { TabStrip } from "@saroh/ui/tabs";

import { requestsHref } from "@/lib/customer-workspace/data-requests-view";

export type CustomersTab = "customers" | "requests";

/**
 * Customers · Requests on Sell › Customers (DEC-172, #1107), as Products'
 * tabs are drawn (`stores/products-tabs.tsx`): links, so the inbox's
 * notice can open `?tab=requests`. Requests is shown only to whoever can
 * run a customer removal (`customer:remove`), with how many are open; a
 * count that couldn't be read is "—", never 0.
 */
export function CustomersTabs({
    active,
    openRequests,
}: {
    active: CustomersTab;
    /** Open requests; null when unknown. */
    openRequests: number | null;
}) {
    return (
        <TabStrip
            label="Customers"
            value={active}
            tabs={[
                {
                    value: "customers",
                    label: "Customers",
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
