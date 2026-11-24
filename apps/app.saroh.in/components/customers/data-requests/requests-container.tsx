"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import type { RequestFilter } from "@/lib/customer-workspace/data-requests-view";
import {
    readRequestFilter,
    requestsHref,
} from "@/lib/customer-workspace/data-requests-view";
import {
    useCustomerRequests,
    useCustomerSave,
} from "@/lib/customers/use-customers";

import { CustomersTabs } from "./customers-tabs";
import { RequestsView } from "./requests-view";

/**
 * Sell › Customers › Requests on React Query (DEC-259): the rows with the
 * address's status and the open ones (the tab's count), each a query. A
 * filter changes the address in place; a request finished reads them again.
 */
export function RequestsContainer({
    heading,
    canRemove,
}: {
    heading: ReactNode;
    canRemove: boolean;
}) {
    const filter = readRequestFilter(useSearchParams().get("status"));
    const open = useCustomerRequests({ status: "open" });
    const rows = useCustomerRequests({ status: filter });
    const { saved } = useCustomerSave();
    const go = (to: RequestFilter) =>
        window.history.replaceState(null, "", requestsHref(to));

    if (rows.isError && !rows.data) throw rows.error;
    if (!rows.data) return null;

    return (
        <RequestsView
            heading={heading}
            tabs={
                <CustomersTabs
                    active="requests"
                    openRequests={
                        open.data?.rows ? open.data.rows.length : null
                    }
                />
            }
            filter={filter}
            rows={rows.data.rows}
            canRemove={canRemove}
            pending={rows.isPlaceholderData}
            onFilter={go}
            onChanged={() => void saved()}
        />
    );
}
