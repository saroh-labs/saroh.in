"use client";

import type { StockLevelRow, StockLevels } from "@/lib/stock/service";
import { useStockLevels } from "@/lib/stock/use-stock";

export type Targets =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; levels: StockLevels };

const COULDNT_LOAD = "Stock couldn't be loaded. Try again.";

/**
 * Every shelf the business counts, read when a dialog mounts (Move stock,
 * the entries sheet) — the Levels table may hold only a page of them. A
 * query (DEC-259): each opening reads afresh unless it was just read. A
 * failure is a sentence to show, never an empty list.
 */
export function useStockTargets(): Targets {
    const { data, isError } = useStockLevels({});
    if (data) return { state: "ready", levels: data };
    return isError
        ? { state: "failed", error: COULDNT_LOAD }
        : { state: "loading" };
}

/** A row's key and name, for a "What" picker. */
export function targetKey(row: {
    productId: string;
    variantId: string | null;
}): string {
    return `${row.productId}|${row.variantId ?? ""}`;
}

export function targetOptions(rows: readonly StockLevelRow[]) {
    return rows.map((r) => ({
        value: targetKey(r),
        label: r.variantTitle
            ? `${r.productName} ${r.variantTitle}`
            : r.productName,
    }));
}
