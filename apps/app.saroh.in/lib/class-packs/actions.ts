"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import * as detail from "./pack-detail-data";
import type { DeskPaidBy } from "./sell-words";
import type { PackInput, PackPurchase } from "./service";
import * as api from "./service";

/**
 * Thin: the API decides who may, and what a pack may pay for. A write from
 * a React Query screen takes the tab's business last (`writeAsOrg`),
 * refusing a tab whose business has since changed, and revalidates
 * nothing: the screen reads its queries again (`useClassPackSave`).
 */

function refresh() {
    // rq-revalidate-ok: only the booking page's pack writes (server-rendered) reach here.
    revalidatePath("/class-packs", "layout");
    // rq-revalidate-ok: as above.
    revalidatePath("/class-packs/purchases");
    // rq-revalidate-ok: as above; spending one changes a booking.
    revalidatePath("/billing/invoices");
    // rq-revalidate-ok: as above.
    revalidatePath("/bookings");
}

async function then<T extends { ok: boolean }>(res: Promise<T>): Promise<T> {
    const r = await res;
    if (r.ok) refresh();
    return r;
}

/** With the tab's business: checked, nothing revalidated; without, as before. */
function asOrg<T extends { ok: boolean }>(
    orgId: string | undefined,
    write: () => Promise<T>,
) {
    return orgId ? writeAsOrg(orgId, write) : then(write());
}

export async function createPack(input: PackInput) {
    return then(api.createPack(input));
}
export async function updatePack(id: string, input: PackInput) {
    return then(api.updatePack(id, input));
}
export async function setPackArchived(
    id: string,
    archived: boolean,
    orgId?: string,
) {
    return asOrg(orgId, () => api.setPackArchived(id, archived));
}
export async function sellPack(
    id: string,
    contactId: string,
    paidBy?: DeskPaidBy,
    orgId?: string,
) {
    return asOrg(orgId, () => api.sellPack(id, contactId, paidBy));
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

export async function payBookingWithPack(
    bookingId: string,
    packPurchaseId: string,
) {
    const res = await then(api.payBookingWithPack(bookingId, packPurchaseId));
    // rq-revalidate-ok: the booking's page is server-rendered.
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
    orgId?: string,
) {
    return asOrg(orgId, () => detail.extendPurchase(purchaseId, days, reason));
}

/** Older activity for Pack Detail (E17): the page after `cursor`. A read. */
export async function olderPackEvents(packId: string, cursor: string) {
    return detail.readPackEvents(packId, cursor);
}

export async function takePackOffBooking(bookingId: string) {
    const res = await then(api.removeFromBooking(bookingId));
    // rq-revalidate-ok: the booking's page is server-rendered.
    if (res.ok) revalidatePath(`/bookings/${bookingId}`);
    return res;
}
