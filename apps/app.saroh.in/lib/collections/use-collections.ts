"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { productsKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";

import { collectionsKeys, collectionsRead } from "./queries";

/** Every collection of the open business; `enabled` false reads nothing. */
export function useCollections(enabled = true) {
    return useQuery({ ...collectionsRead.options(useOrgId(), {}), enabled });
}

/**
 * After a collection write landed (made, renamed, filled, reordered,
 * deleted, a product ticked in or out): Collections and Products read
 * again where they are on screen (the list's Collections view and counts,
 * a product's Collections tab), and only marked stale elsewhere. Resolves
 * once they are back; never throws (a failed read is the screen's state).
 */
export function collectionsSaved(
    qc: QueryClient,
    orgId: string,
): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey: collectionsKeys(orgId) }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId) }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a collection sheet saves: `orgId` last to each write (`writeAsOrg`
 * refuses a moved tab), `saved()` once it landed. A refused write calls
 * nothing.
 */
export interface CollectionSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useCollectionSave(): CollectionSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => collectionsSaved(qc, orgId) }),
        [qc, orgId],
    );
}
