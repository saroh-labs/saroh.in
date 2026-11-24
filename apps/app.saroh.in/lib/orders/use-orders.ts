"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { homeKeys } from "@/lib/home/queries";
import { productsKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";

import type {
    OrderAsk,
    OrdersAsk,
    OrdersOptionsAsk,
    TicketsAsk,
} from "./queries";
import {
    orderKeys,
    orderRead,
    ordersKeys,
    ordersListKeys,
    ordersListRead,
    ordersOptionsRead,
    ticketsRead,
} from "./queries";

/**
 * A page of the list for the open business (DEC-259). A new tab, filter or
 * page keeps the last rows on screen (greyed by the container) until it lands.
 */
export function useOrdersList(ask: OrdersAsk) {
    return useQuery({
        ...ordersListRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** The filter bar's choices and the open counts: a tab change reads neither. */
export function useOrdersOptions(ask: OrdersOptionsAsk) {
    return useQuery({
        ...ordersOptionsRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** One order as its page draws it. */
export function useOrder(ask: OrderAsk) {
    return useQuery(orderRead.options(useOrgId(), ask));
}

/** The tickets to print. */
export function useTickets(ask: TicketsAsk) {
    return useQuery(ticketsRead.options(useOrgId(), ask));
}

/**
 * After an order write landed: the list and the order on screen are read
 * again (the one that is mounted; resolves once it is back, so a busy state
 * lasts until the screen has changed), and what else it moves is marked
 * stale, read on its next visit: the filter bar's counts, Home and Products
 * (stock). Invoices join when they move to React Query (U12). Never throws:
 * a read that fails is the screen's failed state.
 */
export function ordersSaved(qc: QueryClient, orgId: string): Promise<void> {
    const later = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: ordersListKeys(orgId) }),
        qc.invalidateQueries({ queryKey: orderKeys(orgId) }),
        qc.invalidateQueries({ queryKey: ordersKeys(orgId), ...later }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...later }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId), ...later }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How an Orders screen saves (DEC-259): each write is given `orgId` last
 * (the action runs it through `writeAsOrg`, refusing a moved tab), and
 * `saved()` once it landed. A refused write calls nothing: the screen says
 * the refusal and reads nothing again.
 */
export function useOrderSave(): { orgId: string; saved: () => Promise<void> } {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const saved = useCallback(() => ordersSaved(qc, orgId), [qc, orgId]);
    return { orgId, saved };
}
