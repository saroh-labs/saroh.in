"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { productsKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";

import type { DiscountAsk } from "./queries";
import { discountRead, discountsKeys, discountsListRead } from "./queries";

/** `/commerce/discounts`: the codes (DEC-259). */
export function useDiscounts() {
    return useQuery(discountsListRead.options(useOrgId(), {}));
}

/** One code's page. */
export function useDiscount(ask: DiscountAsk) {
    return useQuery(discountRead.options(useOrgId(), ask));
}

/**
 * After a code's save landed, as the form leaves for the list: nothing is
 * read here. The codes (the list, the code open) are marked stale, so the
 * list reads once as it mounts; a product's page (its Discounts panel) is
 * marked stale for its next visit. Social's offer picker reads the codes
 * each time it opens, so it holds nothing to mark.
 */
export function discountsSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: discountsKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a code's form saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab and revalidating
 * nothing), and `saved()` once it landed. A refused write calls nothing.
 */
export interface DiscountsSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useDiscountsSave(): DiscountsSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => discountsSaved(qc, orgId) }),
        [qc, orgId],
    );
}
