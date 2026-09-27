import { getJson, orgBase } from "@/lib/api/http";

import type { FulfilmentFields } from "./read";

/**
 * Orders across the whole business — the read behind Sell → Orders.
 *
 * Separate from `lib/orders/service.ts`, which reads one storefront's orders
 * for the screens inside a storefront. The two answer different questions and
 * are scoped by different things (a store id in the path there, the active
 * organization here), so they stay apart rather than sharing a function with a
 * nullable argument that silently decides which tenant boundary applies.
 *
 * Reads the list's v2 shape (`?v=2`, plan B, B1): the API filters, pages and
 * counts. Without `v=2` the API still answers the old bare array for one
 * release, for an app built before it; nothing here asks for that any more.
 *
 * Server-only: `orgBase` reads the active-org cookie.
 */

/**
 * What the status column says.
 *
 * Resolved by the API from an order's two independent states — where the goods
 * are and where the money is — so every surface that lists orders agrees about
 * precedence instead of each re-deriving it. See `order-standing.ts` there.
 */
export type OrderStanding =
    "UNFULFILLED" | "FULFILLED" | "REFUNDED" | "CANCELLED";

/** Paid, not paid yet, partly refunded or refunded — from the API's sums. */
export type PaymentStanding =
    "PAID" | "UNPAID" | "PARTLY_REFUNDED" | "REFUNDED";

/** The six ways an order leaves (DEC-045), with the words the API sends. */
export type { FulfilmentType } from "./read";

/**
 * One row of the Orders list, as the API builds it (`order-row.ts`), with
 * how it leaves: the legacy word, the type, its steps and where it stands.
 */
export interface OrderRow extends FulfilmentFields {
    id: string;
    /** The storefront's own order number, e.g. "1042". */
    orderId: string;
    /** ISO; rendered in the viewer's timezone, never the server's. */
    placedAt: string;
    /** Whole minutes since it was placed, when the API answered. */
    ageMinutes: number;
    store: { id: string; name: string };
    /** `email` and `phone` only for a role that reads contacts. */
    customer: {
        id: string;
        name: string | null;
        email?: string;
        phone?: string | null;
    } | null;
    status: string;
    paymentStatus: string;
    stage: string;
    standing: OrderStanding;
    payment: PaymentStanding;
    currency: string;
    /**
     * Left out of the kitchen's view: a Member reaches the list through
     * `order:stage` (DEC-024) and the API sends no money to them.
     */
    total?: string;
    /** Still to collect ("0.00" when nothing is); money, so as `total`. */
    unpaidAmount?: string;
    itemCount: number;
    /** The first two products' names, and how many more there are. */
    productNames: string[];
    moreProducts: number;
}

/** The list's filters, as the API reads them (plan B, B1). */
export interface OrderListParams {
    tab?: "all" | "open" | "refunded";
    stage?: string[];
    fulfilment?: string[];
    payment?: PaymentStanding;
    productId?: string;
    customerId?: string;
    storeId?: string;
    late?: boolean;
    /** YYYY-MM-DD, in the business's zone. */
    from?: string;
    to?: string;
    q?: string;
    /** ISO instant: only orders placed from it on (Home's "Last 24 hours"). */
    since?: string;
    cursor?: string;
}

export interface OrderListPage {
    rows: OrderRow[];
    /** Per tab, under every filter but the tab. */
    counts: { all: number; open: number; refunded: number };
    nextCursor: string | null;
}

const EMPTY_PAGE: OrderListPage = {
    rows: [],
    counts: { all: 0, open: 0, refunded: 0 },
    nextCursor: null,
};

/** The query string for a list request, `v=2` first. */
export function orderListQuery(params: OrderListParams = {}): string {
    const search = new URLSearchParams({ v: "2" });
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") continue;
        if (Array.isArray(value)) {
            for (const v of value) search.append(key, String(v));
        } else {
            search.set(key, String(value));
        }
    }
    return search.toString();
}

/**
 * One page of the business's orders, newest first.
 *
 * Empty on no active organization rather than throwing: this is reached from
 * the rail, and someone whose organization went away mid-session should see an
 * empty list, not the error boundary.
 */
export async function listOrderRows(
    params: OrderListParams = {},
): Promise<OrderListPage> {
    const base = await orgBase();
    if (!base) return EMPTY_PAGE;
    const read = await getJson<OrderListPage | OrderRow[]>(
        `${base}/orders?${orderListQuery(params)}`,
    );
    return read ? toOrderListPage(read, params) : EMPTY_PAGE;
}

/** Open, as an older API's row says it: not delivered, cancelled or refunded. */
function openRow(row: OrderRow): boolean {
    return row.standing === "UNFULFILLED" || row.status === "SHIPPED";
}

function refundedRow(row: OrderRow): boolean {
    return row.payment === "REFUNDED" || row.standing === "REFUNDED";
}

/**
 * The v2 page, whatever came back (O-2). An API rolled back past B1
 * ignores `v=2` and answers the old bare array — every order, unpaged and
 * unfiltered — and reading `.rows` off it crashed the list. Read as one
 * page with no next, the tab's rows kept and each tab counted from them,
 * so the list still works while the deploys cross.
 */
export function toOrderListPage(
    read: OrderListPage | OrderRow[],
    params: OrderListParams = {},
): OrderListPage {
    if (!Array.isArray(read)) return read;
    const counts = {
        all: read.length,
        open: read.filter(openRow).length,
        refunded: read.filter(refundedRow).length,
    };
    const rows =
        params.tab === "open"
            ? read.filter(openRow)
            : params.tab === "refunded"
              ? read.filter(refundedRow)
              : read;
    return { rows, counts, nextCursor: null };
}

/**
 * Every matching row, following the cursor to the end.
 *
 * For what needs every row rather than a page: a customer's orders, and the
 * Orders list's Export (`list-actions.ts`). The Orders list itself reads one
 * page at a time (`list-query.ts` holds its address). Stops at `maxPages`
 * pages rather than reading forever; `complete` says whether it reached the
 * end.
 */
export async function listAllOrderRows(
    params: Omit<OrderListParams, "cursor"> = {},
    maxPages = 40,
): Promise<{ rows: OrderRow[]; complete: boolean }> {
    const rows: OrderRow[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < maxPages; i += 1) {
        const page = await listOrderRows({ ...params, cursor });
        rows.push(...page.rows);
        if (!page.nextCursor) return { rows, complete: true };
        cursor = page.nextCursor;
    }
    return { rows, complete: false };
}
