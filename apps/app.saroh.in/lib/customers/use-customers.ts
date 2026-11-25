"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { bookingsKeys } from "@/lib/bookings/queries";
import { contactsKeys } from "@/lib/contacts/queries";
import { homeKeys } from "@/lib/home/queries";
import { invoicesKeys } from "@/lib/invoices/queries";
import { ordersKeys } from "@/lib/orders/queries";
import { useOrgId } from "@/lib/query/org";

import type { CustomerAsk, CustomerRequestsAsk, CustomersAsk } from "./queries";
import {
    customerRead,
    customerRequestsRead,
    customersKeys,
    customersListRead,
} from "./queries";

/**
 * A page of the list for the open business (DEC-259). A new search, chip,
 * sort or page keeps the last rows on screen (greyed) until it lands.
 */
export function useCustomersList(ask: CustomersAsk) {
    return useQuery({
        ...customersListRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** The removal requests with one status; `enabled` false reads nothing. */
export function useCustomerRequests(ask: CustomerRequestsAsk, enabled = true) {
    return useQuery({
        ...customerRequestsRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** One customer's page. */
export function useCustomer(ask: CustomerAsk) {
    return useQuery(customerRead.options(useOrgId(), ask));
}

/**
 * After a customer write landed: what Customers has on screen is read
 * again (on a customer's page, that page alone), resolving once it is back
 * so a busy state lasts until the screen has changed; the rest of Customers
 * is only marked stale. Orders, bookings, invoices and Home name the
 * customer, so they are marked stale for their next visit, and so are
 * Contacts (the list and a person's Leads tab). Never throws: a read that
 * fails is the screen's failed state.
 */
export function customersSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: customersKeys(orgId) }),
        qc.invalidateQueries({ queryKey: ordersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: bookingsKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: invoicesKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: contactsKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Customers part saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab and revalidating
 * nothing), and `saved()` once it landed. A refused write calls nothing.
 */
export interface CustomerSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useCustomerSave(): CustomerSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => customersSaved(qc, orgId) }),
        [qc, orgId],
    );
}
