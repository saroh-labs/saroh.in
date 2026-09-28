"use server";

import { unstable_rethrow } from "next/navigation";

import type { ApiResult } from "@/lib/api/failure";

import type {
    OrderListPage,
    OrderListParams,
    OrderProductOption,
} from "./business-service";
import { listOrderRows, searchOrderProducts } from "./business-service";
import { readOrderQuickView } from "./kitchen-service";
import type { OrderRead } from "./read";

/**
 * Server Actions for the Orders list (plan B, B3, B4, B5). The list itself is
 * read by the page a page at a time; these carry the session to the API
 * for what the browser asks for later. The API decides who may, and leaves
 * money out for a role without `order:read`.
 */

/**
 * One page of the orders the list is narrowed to, for the CSV (B4). Export
 * walks the API's cursor from the browser a page per call, so a long list
 * never waits on one request that reads everything, and the button can
 * say how far it has got.
 */
export async function loadOrdersExportPage(
    params: OrderListParams,
): Promise<ApiResult<OrderListPage>> {
    try {
        return { ok: true, data: await listOrderRows(params) };
    } catch (error) {
        unstable_rethrow(error);
        return {
            ok: false,
            error: "The orders couldn't be read for the export. Try again.",
        };
    }
}

/** The Product filter's search (B4): products on the business's orders. */
export async function findOrderProducts(
    q: string,
): Promise<ApiResult<OrderProductOption[]>> {
    try {
        const products = await searchOrderProducts(q);
        if (products) return { ok: true, data: products };
    } catch (error) {
        unstable_rethrow(error);
    }
    return {
        ok: false,
        error: "Products couldn't be searched. Try again.",
    };
}

/**
 * One order for the quick view (B5). A failure is a named sentence for the
 * panel, with the order's number in it; the list behind it stays as it is.
 */
export async function loadOrderQuickView(
    orderId: string,
    orderRef: string,
): Promise<ApiResult<OrderRead>> {
    try {
        const res = await readOrderQuickView(orderId);
        if (res.ok) return { ok: true, data: res.order };
        return {
            ok: false,
            error:
                res.reason === "gone"
                    ? `Order ${orderRef} isn't here any more.`
                    : res.reason === "denied"
                      ? `Your role can't open order ${orderRef}.`
                      : `Order ${orderRef} couldn't be loaded. Try again.`,
        };
    } catch (error) {
        unstable_rethrow(error);
        return {
            ok: false,
            error: `Order ${orderRef} couldn't be loaded. Try again.`,
        };
    }
}
