"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { homeKeys } from "@/lib/home/queries";
import { ordersKeys } from "@/lib/orders/queries";
import { productsKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";

import type { StockChecksAsk, StockLevelsAsk, StockLogAsk } from "./queries";
import {
    stockChecksRead,
    stockKeys,
    stockLevelsRead,
    stockLogRead,
} from "./queries";

/**
 * Stock's queries for the open business (DEC-259). A new filter or page
 * keeps the last rows on screen (greyed) until it lands; `enabled` false
 * reads nothing.
 */
export function useStockLevels(ask: StockLevelsAsk) {
    return useQuery({
        ...stockLevelsRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

export function useStockLog(ask: StockLogAsk, enabled = true) {
    return useQuery({
        ...stockLogRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
        enabled,
    });
}

export function useStockChecks(ask: StockChecksAsk, enabled = true) {
    return useQuery({
        ...stockChecksRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
        enabled,
    });
}

/**
 * After a stock change landed: the Stock reads on screen are read again
 * (resolving once they are back, so a busy state lasts until the screen
 * changed); Products, Orders and Home show stock and are marked stale for
 * their next visit. Never throws: a read that fails is the screen's failed
 * state.
 */
export function stockSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: stockKeys(orgId) }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: ordersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Stock part saves: `orgId` goes last to each write (the action runs
 * it through `writeAsOrg`, refusing a moved tab), and `saved()` once it
 * landed. A refused write calls nothing.
 */
export interface StockSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useStockSave(): StockSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => stockSaved(qc, orgId) }),
        [qc, orgId],
    );
}
