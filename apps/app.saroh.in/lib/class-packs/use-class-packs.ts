"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { bookingsKeys } from "@/lib/bookings/queries";
import { customersKeys } from "@/lib/customers/queries";
import { invoicesKeys } from "@/lib/invoices/queries";
import { useOrgId } from "@/lib/query/org";

import type { PackAsk } from "./queries";
import {
    classPacksKeys,
    packPurchasesRead,
    packRead,
    packsListRead,
} from "./queries";

/** Class packs' queries for the open business (DEC-259). */
export function usePacksList() {
    return useQuery(packsListRead.options(useOrgId(), {}));
}

export function usePackPurchases() {
    return useQuery(packPurchasesRead.options(useOrgId(), {}));
}

export function usePack(ask: PackAsk) {
    return useQuery(packRead.options(useOrgId(), ask));
}

/**
 * After a pack write landed (made, changed, sold, extended, archived):
 * Class packs and Customers read again what is on screen (a customer's
 * page shows their packs), resolving once it is back so a busy state lasts
 * until the screen changed. A sale makes an invoice and packs pay for
 * bookings, so those are marked stale for their next visit. Never throws:
 * a read that fails is the screen's failed state.
 */
export function packsSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: classPacksKeys(orgId) }),
        qc.invalidateQueries({ queryKey: customersKeys(orgId) }),
        qc.invalidateQueries({ queryKey: invoicesKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: bookingsKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Class packs part saves: `orgId` goes last to each write (the
 * action runs it through `writeAsOrg`, refusing a moved tab), and
 * `saved()` once it landed. A refused write calls nothing.
 */
export interface ClassPackSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useClassPackSave(): ClassPackSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => packsSaved(qc, orgId) }),
        [qc, orgId],
    );
}
