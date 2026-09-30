"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import type { OrderRow } from "@/lib/orders/business-service";
import { ordersToCsv } from "@/lib/orders/export";
import { loadOrdersExportPage } from "@/lib/orders/list-actions";
import type { OrdersQuery } from "@/lib/orders/list-query";
import { orderListParams } from "@/lib/orders/list-query";

/**
 * The most pages Export walks (50 rows each): 20,000 orders, past anything
 * a CSV built in a browser tab should hold. It says so if it stops there.
 */
const MAX_PAGES = 400;

/**
 * Export (plan B, B4): every order the list is narrowed to — the tab, the
 * search, the storefront and the filters, not only the page on screen — as
 * a CSV built in the browser. It walks the API's cursor a page per request,
 * saying how many it has read, so a long export shows it is working and no
 * single request reads everything. `order:export` (B16): the list draws it
 * only for someone who holds it, and the API asks it of every page.
 */
export function OrderExport({
    query,
    total,
    storeName,
}: {
    query: OrdersQuery;
    /** The tab's count under the filters: what the export will hold. */
    total: number;
    storeName?: string;
}) {
    const [read, setRead] = useState<number | null>(null);

    async function run() {
        setRead(0);
        const params = orderListParams({ ...query, cursor: null, back: [] });
        const rows: OrderRow[] = [];
        let cursor: string | undefined;
        let complete = false;
        for (let i = 0; i < MAX_PAGES; i += 1) {
            const res = await loadOrdersExportPage({ ...params, cursor });
            if (!res.ok) {
                setRead(null);
                showError("Nothing was exported.", res.error);
                return;
            }
            rows.push(...res.data.rows);
            setRead(rows.length);
            if (!res.data.nextCursor) {
                complete = true;
                break;
            }
            cursor = res.data.nextCursor;
        }
        setRead(null);
        downloadCsv(rows, storeName);
        if (complete) {
            showSuccess(
                `Exported ${rows.length} ${rows.length === 1 ? "order" : "orders"} as a spreadsheet file.`,
            );
        } else {
            showError(
                `Only the newest ${rows.length} orders were exported.`,
                "Narrow the list, by date or location, to export the rest.",
            );
        }
    }

    const busy = read !== null;
    return (
        <Button
            variant="outline"
            disabled={total === 0 || busy}
            onClick={() => void run()}
            aria-live="polite"
        >
            {busy ? `Exporting… ${read} of ${total}` : "Export"}
        </Button>
    );
}

/**
 * Hand the orders to the browser as a CSV file. Named for the storefront
 * when the list is filtered to one, and dated, so a folder of exports sorts
 * itself.
 */
function downloadCsv(rows: OrderRow[], storeName?: string) {
    // A byte-order mark, so Excel reads ₹ and names in the right encoding.
    const blob = new Blob(["﻿", ordersToCsv(rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    const scope = storeName
        ? `-${storeName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}`
        : "";
    a.href = url;
    a.download = `orders${scope}-${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
