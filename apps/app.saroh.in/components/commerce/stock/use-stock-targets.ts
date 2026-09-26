"use client";

import { useEffect, useState } from "react";

import { loadStockTargets } from "@/lib/stock/screen-actions";
import type { StockLevelRow, StockLevels } from "@/lib/stock/service";

export type Targets =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; levels: StockLevels };

/**
 * Every shelf the business counts, read when a dialog mounts (Move stock,
 * the entries sheet) — the Levels table may hold only a page of them. The
 * screen mounts a dialog only while it is open, so each opening reads
 * afresh.
 */
export function useStockTargets(): Targets {
    const [targets, setTargets] = useState<Targets>({ state: "loading" });
    useEffect(() => {
        let live = true;
        void loadStockTargets().then((res) => {
            if (!live) return;
            setTargets(
                res.ok
                    ? { state: "ready", levels: res.data }
                    : { state: "failed", error: res.error },
            );
        });
        return () => {
            live = false;
        };
    }, []);
    return targets;
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
