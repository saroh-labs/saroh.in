import type { OrderRow, PaymentStanding } from "@/lib/orders/business-service";
import { rowProgress } from "@/lib/orders/list-row";

const PAYMENT_WORD: Record<PaymentStanding, string> = {
    PAID: "Paid",
    UNPAID: "Not paid yet",
    PARTLY_REFUNDED: "Partly refunded",
    REFUNDED: "Refunded",
};

/** One CSV field, quoted when it has to be. */
function cell(value: string | number): string {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** "Sourdough; Croissant; +2 more" — the row's product names. */
function productsText(o: OrderRow): string {
    const names = [...o.productNames];
    if (o.moreProducts > 0) names.push(`+${o.moreProducts} more`);
    return names.join("; ");
}

interface Column {
    head: string;
    value: (o: OrderRow) => string | number;
}

/**
 * The orders in view as CSV, for a spreadsheet or an accountant — the
 * design's Export (plan B, B4). Built from every row the list is narrowed
 * to — its tab, search, storefront and filters, not only the page on
 * screen — with the columns the design names: how it leaves, the step its
 * pill says (Refunded or Cancelled when it is), whether it is late, and
 * how it stands for payment.
 *
 * What the API left out stays out: the money columns only when the rows
 * carry money (`order:read`), and email and phone only when they carry
 * contact details (`contact:read`). Money is the decimal the API sent,
 * beside its currency, so a sheet can sum it.
 */
export function ordersToCsv(orders: OrderRow[]): string {
    const money = orders.some((o) => o.total !== undefined);
    const contact = orders.some(
        (o) => o.customer?.email !== undefined || o.customer?.phone != null,
    );
    const columns: Column[] = [
        { head: "Order", value: (o) => o.orderId },
        { head: "Placed", value: (o) => o.placedAt },
        {
            head: "Customer",
            // A walk-in (B13) by the name they gave, marked as one.
            value: (o) =>
                o.customer?.name ??
                (o.walkIn ? `${o.walkIn.name} (walk-in)` : ""),
        },
        ...(contact
            ? [
                  {
                      head: "Email",
                      value: (o: OrderRow) => o.customer?.email ?? "",
                  },
                  {
                      head: "Phone",
                      value: (o: OrderRow) =>
                          o.customer?.phone ?? o.walkIn?.phone ?? "",
                  },
              ]
            : []),
        { head: "Location", value: (o) => o.store.name },
        { head: "Fulfilment", value: (o) => o.fulfilmentLabel },
        { head: "Step", value: (o) => rowProgress(o).word },
        { head: "Late", value: (o) => (o.late ? "Yes" : "No") },
        { head: "Payment", value: (o) => PAYMENT_WORD[o.payment] },
        { head: "Items", value: (o) => o.itemCount },
        { head: "Products", value: productsText },
        ...(money
            ? [
                  {
                      head: "Unpaid",
                      value: (o: OrderRow) => o.unpaidAmount ?? "",
                  },
                  { head: "Total", value: (o: OrderRow) => o.total ?? "" },
                  { head: "Currency", value: (o: OrderRow) => o.currency },
              ]
            : []),
    ];
    const lines = [
        columns.map((c) => cell(c.head)).join(","),
        ...orders.map((o) => columns.map((c) => cell(c.value(o))).join(",")),
    ];
    return lines.join("\r\n");
}
