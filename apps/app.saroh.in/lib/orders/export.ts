import type { BusinessOrder } from "@/lib/orders/business-service";

const STANDING_WORD: Record<BusinessOrder["standing"], string> = {
    UNFULFILLED: "Unfulfilled",
    FULFILLED: "Fulfilled",
    REFUNDED: "Refunded",
    CANCELLED: "Cancelled",
};

/** One CSV field, quoted when it has to be. */
function cell(value: string | number): string {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The orders in view as CSV, for a spreadsheet or an accountant — the design's
 * Export. Built from the rows the screen already holds, so it is exactly the
 * list the merchant is looking at, storefront filter and all. Money is the
 * decimal the API sent, beside its currency, so a sheet can sum it.
 */
export function ordersToCsv(orders: BusinessOrder[]): string {
    const header = [
        "Order",
        "Placed",
        "Storefront",
        "Customer",
        "Email",
        "Items",
        "Total",
        "Currency",
        "Standing",
    ];
    const rows = orders.map((o) => [
        o.orderId,
        o.placedAt,
        o.store.name,
        o.customer?.name ?? "",
        o.customer?.email ?? "",
        o.itemCount,
        o.total ?? "",
        o.currency,
        STANDING_WORD[o.standing],
    ]);
    return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
