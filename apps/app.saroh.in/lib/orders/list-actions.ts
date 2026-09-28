"use server";

import { unstable_rethrow } from "next/navigation";

import type { ApiResult } from "@/lib/api/failure";

import type { OrderListParams, OrderRow } from "./business-service";
import { listAllOrderRows } from "./business-service";

/**
 * Server Actions for the Orders list (plan B, B3). The list itself is read by
 * the page a page at a time; Export needs every row the list is narrowed to,
 * not just the page on screen, so it walks the API's cursor here. The API
 * decides who may and leaves money out for a role without `order:read`.
 */

/**
 * Every order the list is narrowed to, for the CSV. Stops at the page limit
 * of `listAllOrderRows`, and says so (`complete`), rather than reading
 * forever.
 */
export async function loadOrdersForExport(
    params: Omit<OrderListParams, "cursor">,
): Promise<ApiResult<{ rows: OrderRow[]; complete: boolean }>> {
    try {
        return { ok: true, data: await listAllOrderRows(params) };
    } catch (error) {
        unstable_rethrow(error);
        return {
            ok: false,
            error: "The orders couldn't be read for the export. Try again.",
        };
    }
}
