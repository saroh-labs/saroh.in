"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { collectionsKeys } from "@/lib/collections/queries";
import { useOrgId } from "@/lib/query/org";

import type { CategoriesAsk, ProductSettingsAsk } from "./queries";
import {
    categoriesRead,
    productSettingsKeys,
    productSettingsRead,
    productsKeys,
} from "./queries";

/** The business's categories (and option names, when asked); `enabled` false reads nothing. */
export function useCategories(ask: CategoriesAsk = {}, enabled = true) {
    return useQuery({ ...categoriesRead.options(useOrgId(), ask), enabled });
}

/** The Product settings page's lists. */
export function useProductSettings(ask: ProductSettingsAsk) {
    return useQuery(productSettingsRead.options(useOrgId(), ask));
}

/**
 * After a Product settings write landed: its reads (the page, the
 * categories) again where shown; Products and Collections, which name
 * categories and options, read again only where on screen and marked
 * stale elsewhere. Resolves once they are back; never throws.
 */
export function productSettingsSaved(
    qc: QueryClient,
    orgId: string,
): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey: productSettingsKeys(orgId) }),
        qc.invalidateQueries({ queryKey: productsKeys(orgId) }),
        qc.invalidateQueries({ queryKey: collectionsKeys(orgId) }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/** How a Product settings tab saves: `orgId` last to each write, `saved()` after. */
export interface ProductSettingsSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useProductSettingsSave(): ProductSettingsSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => productSettingsSaved(qc, orgId) }),
        [qc, orgId],
    );
}
