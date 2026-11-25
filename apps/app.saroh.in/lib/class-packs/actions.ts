"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import * as detail from "./pack-detail-data";
import type { DeskPaidBy } from "./sell-words";
import type { PackInput, PackPurchase } from "./service";
import * as api from "./service";

/** Thin: the API decides who may, and what a pack may pay for. */

function refresh() {
    // "layout": the list and every pack's own page (E16) under it.
    revalidatePath("/class-packs", "layout");
    revalidatePath("/class-packs/purchases");
    // Selling may issue an invoice; spending one changes a booking.
    revalidatePath("/billing/invoices");
    revalidatePath("/bookings");
}

async function then<T extends { ok: boolean }>(res: Promise<T>): Promise<T> {
    const r = await res;
    if (r.ok) refresh();
    return r;
}

export async function createPack(input: PackInput) {
    return then(api.createPack(input));
}
export async function updatePack(id: string, input: PackInput) {
    return then(api.updatePack(id, input));
}
export async function setPackArchived(id: string, archived: boolean) {
    return then(api.setPackArchived(id, archived));
}
export async function sellPack(
    id: string,
    contactId: string,
    paidBy?: DeskPaidBy,
) {
    return then(api.sellPack(id, contactId, paidBy));
}

/**
 * A person's packs that pay for a service — what New booking offers once it
 * knows who and what. Null when they could not be read, so the dialog says
 * nothing about packs rather than "none".
 */
export async function packsFor(
    contactId: string,
    serviceId: string,
): Promise<PackPurchase[] | null> {
    return api.readPurchasesFor(contactId, serviceId);
}

/**
 * From a booking's page on React Query (U26) the tab's business comes
 * last: the write is refused when it isn't the open one, and nothing is
 * revalidated (the page reads its own query again).
 */
export async function payBookingWithPack(
    bookingId: string,
    packPurchaseId: string,
    orgId?: string,
) {
    if (orgId) {
        return writeAsOrg(orgId, () =>
            api.payBookingWithPack(bookingId, packPurchaseId),
        );
    }
    const res = await then(api.payBookingWithPack(bookingId, packPurchaseId));
    if (res.ok) revalidatePath(`/bookings/${bookingId}`);
    return res;
}
/**
 * Give a holder's pack more days, 1 to 30 with a reason (E16 on E13). The
 * refusal keeps its status, so the dialog says a 409 in plain words.
 */
export async function extendHolder(
    purchaseId: string,
    days: number,
    reason: string,
) {
    return then(detail.extendPurchase(purchaseId, days, reason));
}

/** Older activity for Pack Detail (E17): the page after `cursor`. A read. */
export async function olderPackEvents(packId: string, cursor: string) {
    return detail.readPackEvents(packId, cursor);
}

export async function takePackOffBooking(bookingId: string, orgId?: string) {
    if (orgId) return writeAsOrg(orgId, () => api.removeFromBooking(bookingId));
    const res = await then(api.removeFromBooking(bookingId));
    if (res.ok) revalidatePath(`/bookings/${bookingId}`);
    return res;
}
