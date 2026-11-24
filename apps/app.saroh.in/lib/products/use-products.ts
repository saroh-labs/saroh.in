"use client";

import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import type { QuickEdits } from "@/components/commerce/quick-edits/quick-edits";
import { homeKeys } from "@/lib/home/queries";
import { useOrgId } from "@/lib/query/org";

import type { QuickPatch } from "./cache";
import { applyQuick } from "./cache";
import type { CatalogueAsk, ProductAsk } from "./queries";
import { productRead, productsKeys, productsListRead } from "./queries";

/**
 * A page of the catalogue for the open business (DEC-259). A new filter
 * keeps the last rows on screen (greyed by the container) until it lands.
 */
export function useProductsList(ask: CatalogueAsk) {
    return useQuery({
        ...productsListRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** One product's page: its overview, and its shelves where shown. */
export function useProduct(ask: ProductAsk) {
    return useQuery(productRead.options(useOrgId(), ask));
}

/**
 * After a save: every Products read of the business again (the active
 * ones now), Home marked stale. Resolves once they are back, so a busy
 * state lasts until the screen has changed, as before.
 */
export function useProductsSaved(): () => Promise<void> {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: productsKeys(orgId) }),
            qc.invalidateQueries({
                queryKey: homeKeys(orgId),
                refetchType: "none",
            }),
        ]).then(() => undefined);
}

interface Vars {
    ids: readonly string[];
    patch: QuickPatch;
    action: (orgId: string) => Promise<{ ok: boolean }[]>;
}

/**
 * The quick edits' host (owner, 23 Nov): the patch is in every cached list
 * page and the product's page at once; the action runs with the tab's
 * business (it refuses a moved tab); an error or any answer that is not
 * `ok` puts the snapshot back, and the caller says the refusal as before.
 * After a save that landed, Products is read again once; a refused one
 * reads nothing. `after`: the screen reads itself again instead (a tab
 * still drawn by the server), its queries only marked stale.
 */
export function useQuickEditsHost(after?: () => void): QuickEdits {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const saved = useProductsSaved();
    const { mutateAsync } = useMutation({
        mutationFn: async ({ ids, patch, action }: Vars) => {
            await qc.cancelQueries({ queryKey: productsKeys(orgId) });
            const undo = applyQuick(qc, orgId, ids, patch);
            let results: { ok: boolean }[];
            try {
                results = await action(orgId);
            } catch (error) {
                undo();
                throw error;
            }
            if (results.some((r) => !r.ok)) undo();
            if (results.some((r) => r.ok)) {
                if (after) {
                    // The screen reads itself again (`after`): marked
                    // stale only, so nothing is read twice.
                    await qc.invalidateQueries({
                        queryKey: productsKeys(orgId),
                        refetchType: "none",
                    });
                    after();
                } else await saved();
            }
            return results;
        },
    });
    return useMemo(
        () => ({
            run: (ids, patch, action) =>
                mutateAsync({ ids, patch, action }) as Promise<
                    Awaited<ReturnType<typeof action>>
                >,
        }),
        [mutateAsync],
    );
}
