import { cache } from "react";

import type {
    AccountBlock,
    AccountBookingRow,
    AccountBookings,
    AccountCourse,
    AccountDataRequest,
    AccountHomeData,
    AccountInvoiceDue,
    AccountNote,
    AccountNotices,
    AccountOrder,
    AccountPacksOnSale,
    AccountPlanTab,
    AccountReceipt,
    AccountThread,
    AccountView,
    AccountWaitlistPlace,
    BookingLookup,
    TrackLookup,
} from "@saroh/site-blocks";

import { bookingsResult, isBookingRow } from "./account-bookings-shape";
import {
    coursesResult,
    dataRequestResult,
    invoicesDueResult,
    noticesResult,
    waitlistResult,
} from "./account-details-shape";
import { packsOnSaleResult } from "./account-packs-shape";
import {
    homeResult,
    isAccountView,
    notesResult,
    orderDetailResult,
    ordersResult,
    planTabResult,
    receiptsResult,
    threadResult,
} from "./account-shape";
import { accountFetch } from "./customer-session";
import type { PayInvoice } from "./invoice-pay-shape";
import { isPayInvoice } from "./invoice-pay-shape";

/**
 * The customer account area on a merchant's site, from this server's side
 * (round-2 plan A, A5).
 *
 * **The switch.** `SITE_ACCOUNT_AREA=on` shows the header's Sign in / account
 * entry on every site and serves `/account`; anything else — unset included
 * — hides both, and `/account` is a 404. The API has its own
 * `SITE_ACCOUNT_AREA`, the server half that keeps the area private; switch
 * the API on first, then this app. Both stay off until A6–A8 and A13 have
 * shipped (waves plan, release boundary 4). Readers of this switch: this
 * file (`accountAreaOn`, defined in `account-area-switch.ts` so the edge
 * middleware can read it too) and `middleware.ts`, which answers `/account`
 * with a 404 while it is off, before the layout reads the site.
 * Delete it with the API's once the area has been on a release.
 *
 * Every read goes through `accountFetch`: the session cookie, forwarded
 * with the signed relay, and a cleared cookie when the API says the session
 * is over. Every answer is checked (`account-shape.ts`) before a page sees it.
 */
export { accountAreaOn } from "./account-area-switch";

async function readJson(
    path: string,
): Promise<
    | { ok: true; body: unknown }
    | { ok: false; reason: "signed-out" | "missing" | "unavailable" }
> {
    const call = await accountFetch(path);
    if (!call) return { ok: false, reason: "signed-out" };
    if (!call.ok) return { ok: false, reason: "unavailable" };
    const { res } = call;
    if (res.status === 401) return { ok: false, reason: "signed-out" };
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, body: await res.json().catch(() => null) };
}

export type AccountLookup =
    | { ok: true; account: AccountView }
    | { ok: false; reason: "signed-out" | "missing" | "unavailable" };

/**
 * The signed-in customer's account, once per request (the layout and the
 * page both need it). "missing" is the API's switch being off.
 */
export const getAccount = cache(async (): Promise<AccountLookup> => {
    const read = await readJson("me");
    if (!read.ok) return read;
    return isAccountView(read.body)
        ? { ok: true, account: read.body }
        : { ok: false, reason: "unavailable" };
});

/** Home's blocks, or null when Home itself couldn't be read. */
export async function getAccountHome(): Promise<AccountHomeData | null> {
    const read = await readJson("me/home");
    return read.ok ? homeResult(read.body) : null;
}

/** The Plan tab (A8), or null when it couldn't be read at all. */
export async function getPlanTab(): Promise<AccountPlanTab | null> {
    const read = await readJson("me/plan");
    return read.ok ? planTabResult(read.body) : null;
}

/**
 * The packs on sale to buy online from the Plan tab (A11), or null when
 * they couldn't be read — the tab then offers no "Buy a pack", as with an
 * API from before A11.
 */
export async function getPacksOnSale(): Promise<AccountPacksOnSale | null> {
    const read = await readJson("me/packs");
    return read.ok ? packsOnSaleResult(read.body) : null;
}

export async function getReceipts(): Promise<AccountBlock<AccountReceipt[]>> {
    const read = await readJson("me/receipts");
    const value = read.ok ? receiptsResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/** The customer's thread with the business (A13); reading it opens it. */
export async function getThread(): Promise<AccountBlock<AccountThread>> {
    const read = await readJson("me/messages");
    const value = read.ok ? threadResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

export async function getNotes(): Promise<AccountBlock<AccountNote[]>> {
    const read = await readJson("me/notes");
    const value = read.ok ? notesResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/** The Orders tab's list (A7). A failed read stays failed, never "none". */
export async function getOrders(): Promise<AccountBlock<AccountOrder[]>> {
    const read = await readJson("me/orders");
    const value = read.ok ? ordersResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/**
 * One order's Track (A7). Another customer's is "missing". Once per
 * request: the order's own page reads it for its title and for its body.
 */
export const getOrder = cache(async (orderId: string): Promise<TrackLookup> => {
    const read = await readJson(`me/orders/${encodeURIComponent(orderId)}`);
    if (!read.ok) {
        return {
            ok: false,
            reason: read.reason === "missing" ? "missing" : "unavailable",
        };
    }
    const order = orderDetailResult(read.body);
    return order ? { ok: true, order } : { ok: false, reason: "unavailable" };
});

/** The Bookings tab's lists (A6). A failed read stays failed, never "none". */
export async function getBookings(): Promise<AccountBlock<AccountBookings>> {
    const read = await readJson("me/bookings");
    const value = read.ok ? bookingsResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/**
 * One of the customer's bookings (A6), for moving a class on the booking
 * page. Null when it isn't theirs, they're signed out, or it can't be read.
 */
export async function getMyBooking(
    ref: string,
): Promise<AccountBookingRow | null> {
    const read = await readJson(`me/bookings/${encodeURIComponent(ref)}`);
    return read.ok && isBookingRow(read.body) ? read.body : null;
}

/**
 * One booking, for its own page (DEC-142): another customer's, or one that
 * isn't there, is "missing"; anything else that went wrong is
 * "unavailable". The two are never the same answer.
 */
export async function getBooking(ref: string): Promise<BookingLookup> {
    const read = await readJson(`me/bookings/${encodeURIComponent(ref)}`);
    if (!read.ok) {
        return {
            ok: false,
            reason: read.reason === "missing" ? "missing" : "unavailable",
        };
    }
    return isBookingRow(read.body)
        ? { ok: true, booking: read.body }
        : { ok: false, reason: "unavailable" };
}

/** A list read as a block: a failed read stays failed, never "none". */
async function listBlock<T>(
    path: string,
    result: (body: unknown) => T[] | null,
): Promise<AccountBlock<T[]>> {
    const read = await readJson(path);
    const value = read.ok ? result(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/** The customer's open invoices (DEC-142), the one due soonest first. */
export function getInvoicesDue(): Promise<AccountBlock<AccountInvoiceDue[]>> {
    return listBlock("me/invoices", invoicesDueResult);
}

/** Their places in a class's line (DEC-142). */
export function getWaitlist(): Promise<AccountBlock<AccountWaitlistPlace[]>> {
    return listBlock("me/waitlist", waitlistResult);
}

/** The courses they hold a seat on (DEC-142). */
export function getCourses(): Promise<AccountBlock<AccountCourse[]>> {
    return listBlock("me/courses", coursesResult);
}

/** Whether the business may email them (DEC-142). */
export async function getNotices(): Promise<AccountBlock<AccountNotices>> {
    const read = await readJson("me/notifications");
    const value = read.ok ? noticesResult(read.body) : null;
    return value ? { ok: true, value } : { ok: false };
}

/**
 * Their latest "Ask to remove my data" request (DEC-172, #1107): null when
 * they never asked; a failed read stays failed, never "never asked".
 */
export async function getDataRequest(): Promise<
    AccountBlock<AccountDataRequest | null>
> {
    const read = await readJson("me/data-request");
    const value = read.ok ? dataRequestResult(read.body) : undefined;
    return value === undefined ? { ok: false } : { ok: true, value };
}

export type ReceiptLookup =
    | { ok: true; receipt: PayInvoice }
    | { ok: false; reason: "missing" | "unavailable" | "signed-out" };

/**
 * One receipt, as the pay link's paper. Another customer's is "missing".
 * Once per request: the page reads it for its title and for its body.
 */
export const getReceipt = cache(
    async (invoiceId: string): Promise<ReceiptLookup> => {
        const read = await readJson(
            `me/receipts/${encodeURIComponent(invoiceId)}`,
        );
        if (!read.ok) return read;
        return isPayInvoice(read.body)
            ? { ok: true, receipt: read.body }
            : { ok: false, reason: "unavailable" };
    },
);
