import { apiFetch, orgBase } from "@/lib/api/http";
import type { HomeModel } from "@/lib/home/service";
import type { OrderListPage } from "@/lib/orders/business-service";
import { orderListQuery } from "@/lib/orders/business-service";
import { permits } from "@/lib/organizations/permits";
import type { BookingWithService } from "@/lib/services/service";
import { listBookingsWithPast } from "@/lib/services/service";

import {
    firstBookingMoment,
    homeMayHaveFirstBooking,
    homeMayHaveFirstOrder,
    ordersMoment,
    unseen,
} from "./derive";
import type { MomentView } from "./keys";
import { getSeenMoments } from "./service";

/**
 * The moment a screen shows, if any (wave G): what `derive.ts` finds true
 * in the screen's own read, less what the business has already seen. The
 * seen list is asked only once there is a moment to show, so a screen with
 * none pays nothing. Server-only.
 */

type Viewer = { actions?: readonly string[] } | null | undefined;

/** Orders: the first, 10th or 100th order, on the whole list's first page. */
export async function ordersListMoment(
    page: Pick<OrderListPage, "rows" | "counts">,
    { plain, viewer }: { plain: boolean; viewer: Viewer },
): Promise<MomentView | null> {
    const moment = ordersMoment(page, {
        plain,
        reads: permits(viewer, "order:read"),
    });
    return moment ? unseen(moment, await getSeenMoments()) : null;
}

/** Bookings: the first booking, from every booking the list read. */
export async function bookingsListMoment(
    bookings: readonly BookingWithService[],
    viewer: Viewer,
): Promise<MomentView | null> {
    const moment = firstBookingMoment(bookings, {
        reads: permits(viewer, "booking:read"),
    });
    return moment ? unseen(moment, await getSeenMoments()) : null;
}

/**
 * Home: the same moments, in the first 24 hours, an order before a
 * booking. Home's read holds no all-time count, so the list is read only
 * when Home's own figures make a first possible (`homeMayHaveFirst…`), and
 * softly: a moment is a nicety, and a read that fails leaves Home as it is.
 */
export async function homeMoment(
    home: HomeModel,
    viewer: Viewer,
): Promise<MomentView | null> {
    if (permits(viewer, "order:read") && homeMayHaveFirstOrder(home)) {
        const page = await readOrdersSoftly();
        const moment = page
            ? await ordersListMoment(page, { plain: true, viewer })
            : null;
        if (moment) return moment;
    }
    if (permits(viewer, "booking:read") && homeMayHaveFirstBooking(home)) {
        // Empty when it can't be read, which is no moment.
        return bookingsListMoment(await listBookingsWithPast(), viewer);
    }
    return null;
}

/**
 * The whole Orders list's first page, or null. Not `listOrderRows`, which
 * turns a refusal into the page's own (`forbidden()`) and a failure into
 * its error boundary: right for Orders, wrong for an aside on Home.
 */
async function readOrdersSoftly(): Promise<OrderListPage | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/orders?${orderListQuery()}`).catch(
        () => null,
    );
    if (!res?.ok) return null;
    const page = (await res.json().catch(() => null)) as OrderListPage | null;
    return page && Array.isArray(page.rows) && page.counts ? page : null;
}
