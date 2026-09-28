"use client";

import { useState } from "react";

import type { OrderRow } from "@/lib/orders/business-service";

import type { RowSelect } from "./order-row";

/**
 * The rows selected for a bulk move (B6), on the page in view. Selection
 * belongs to one view of the list: it is kept against the address (`view`),
 * so a new tab, filter or page starts with nothing selected, without an
 * effect to clear it.
 */
export function useOrderSelection(rows: OrderRow[], view: string) {
    const [picked, setPicked] = useState<{
        view: string;
        ids: ReadonlySet<string>;
    }>({ view, ids: new Set() });
    const ids = picked.view === view ? picked.ids : new Set<string>();
    const selected = rows.filter((r) => ids.has(r.id));
    const all = rows.length > 0 && selected.length === rows.length;

    const set = (next: Set<string>) => setPicked({ view, ids: next });

    return {
        selected,
        clear: () => set(new Set()),
        row: (row: OrderRow): RowSelect => ({
            checked: ids.has(row.id),
            onToggle: () => {
                const next = new Set(ids);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                set(next);
            },
        }),
        head: {
            state: all
                ? true
                : selected.length > 0
                  ? ("indeterminate" as const)
                  : false,
            onToggle: () =>
                set(all ? new Set() : new Set(rows.map((r) => r.id))),
        },
    };
}
