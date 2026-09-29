import { unstable_rethrow } from "next/navigation";

import { getJson, orgBase } from "@/lib/api/http";
import type {
    AttentionKind,
    AttentionSource,
} from "@/lib/customer-workspace/attention";

import type { FulfilmentFields, FulfilmentType } from "./read";

/**
 * Orders across the whole business — the read behind Sell → Orders.
 *
 * Separate from `lib/orders/service.ts`, which reads one storefront's orders
 * for the screens inside a storefront. The two answer different questions and
 * are scoped by different things (a store id in the path there, the active
 * organization here), so they stay apart rather than sharing a function with a
 * nullable argument that silently decides which tenant boundary applies.
 *
 * Reads the list's rows, counts and cursor (plan B, B1): the API filters,
 * pages and counts. `v=2` is still sent; since the contract release (B2d) the
 * API answers this shape with or without it.
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
 * how it leaves: the type, its steps and where it stands.
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
    /** A walk-in (B13), with no customer record. Absent before B13. */
    walkIn?: { name: string; phone: string | null } | null;
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
    /**
     * When the order's pay link was made (B11); null when it has none. Only
     * with `order:read`, and absent from an API before B5. Never the link.
     */
    payLinkCreatedAt?: string | null;
    /**
     * The customer's Needs attention this viewer may see (B15), Allergy
     * first: a sensitive entry is here only for a role that may read it.
     * Null when the API couldn't read it (the row says "Not available");
     * absent from an API before B15.
     */
    attention?: OrderAttentionTag[] | null;
}

/** One Needs attention entry on a row (B15): its kind and words. */
export interface OrderAttentionTag {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    source: AttentionSource;
}

/** The date presets the API reads in the business's zone (B4). */
export type OrderDatePreset = "today" | "yesterday" | "7d" | "month";

/**
 * What the filter bar offers (B4, `GET …/orders/filters`): the ways the
 * business's orders leave and the words their pills show — from its own
 * orders, so a pick-up-only bakery is never offered "Handed to courier" —
 * and the name of the product a link filters on.
 */
export interface OrderFilterOptions {
    types: { type: FulfilmentType; label: string }[];
    steps: {
        key: string;
        label: string;
        /** The types whose orders show it; empty for Refunded and Cancelled. */
        types: FulfilmentType[];
    }[];
    product: { id: string; name: string } | null;
}

/** A product the Product filter's search finds. */
export interface OrderProductOption {
    id: string;
    name: string;
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
    /**
     * Only orders whose customer has Needs attention this viewer may see
     * (B15); a sensitive-only entry counts only for a role that may read it.
     */
    attention?: boolean;
    /**
     * What the row's pill says, as the API keys it ("ready",
     * "handed-to-courier", "refunded"); from `getOrderFilterOptions`. B4.
     */
    step?: string;
    /** A preset the API reads in the business's zone. Not with from/to. B4. */
    date?: OrderDatePreset;
    /** YYYY-MM-DD, in the business's zone. */
    from?: string;
    to?: string;
    q?: string;
    /** ISO instant: only orders placed from it on (Home's "Last 24 hours"). */
    since?: string;
    cursor?: string;
    /**
     * This page is read for Export (B16): the API asks `order:export` of
     * it, as a file of every order leaving Saroh is its own power.
     */
    export?: true;
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
    const read = await getJson<OrderListPage>(
        `${base}/orders?${orderListQuery(params)}`,
    );
    return read ?? EMPTY_PAGE;
}

/**
 * What the filter bar offers (B4). Null when it couldn't be read — an API
 * from before B4 answers 404 here — and the bar then leaves out the menus
 * it would fill rather than offer nothing in them; the list itself still
 * renders. Next's interrupts (a 403's `forbidden()`) pass through.
 */
export async function getOrderFilterOptions(
    productId?: string,
): Promise<OrderFilterOptions | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = productId
        ? `?${new URLSearchParams({ productId }).toString()}`
        : "";
    try {
        const read = await getJson<OrderFilterOptions>(
            `${base}/orders/filters${query}`,
        );
        return read && Array.isArray(read.types) && Array.isArray(read.steps)
            ? read
            : null;
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}

/**
 * The Product filter's search (B4): the business's products that are on
 * its orders, by name. Null when the search couldn't be read.
 */
export async function searchOrderProducts(
    q: string,
): Promise<OrderProductOption[] | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = q.trim()
        ? `?${new URLSearchParams({ q: q.trim() }).toString()}`
        : "";
    const read = await getJson<{ products: OrderProductOption[] }>(
        `${base}/orders/products${query}`,
    );
    return read && Array.isArray(read.products) ? read.products : null;
}

/**
 * Every matching row, following the cursor to the end.
 *
 * For what needs every row rather than a page: a customer's orders. The
 * Orders list reads one page at a time (`list-query.ts` holds its
 * address), and its Export walks the pages from the browser, a page per
 * request (`loadOrdersExportPage`). Stops at `maxPages` pages rather than
 * reading forever; `complete` says whether it reached the end.
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
