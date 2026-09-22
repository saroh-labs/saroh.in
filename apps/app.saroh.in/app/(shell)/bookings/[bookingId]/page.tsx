import { notFound } from "next/navigation";

import { BookingDetailView } from "@/components/bookings/booking-detail";
import { canReadPacks, canWritePacks } from "@/lib/class-packs/access";
import { packOffer, usablePacks } from "@/lib/class-packs/balance";
import { readPurchasesFor } from "@/lib/class-packs/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { hasEnded } from "@/lib/services/booking-state";
import type { BookingDetail } from "@/lib/services/service";
import { getBooking } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

/**
 * One booking (#121).
 *
 * Cancelling was the only thing a merchant could do to a booking, and there
 * was nowhere to do anything else from: the calendar was the whole of the
 * Appointments surface, so "who is this, and can we move it?" — the two things
 * a merchant is asked on the phone — had no screen to be answered on.
 *
 * The page fetches; the view decides how to render, matching the list.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ bookingId: string }>;
}) {
    const { bookingId } = await params;
    const booking = await getBooking(bookingId);
    return { title: booking ? `${booking.service.name} booking` : "Booking" };
}

export default async function BookingPage({
    params,
}: {
    params: Promise<{ bookingId: string }>;
}) {
    await requireSession();
    const { bookingId } = await params;

    // Null covers missing, another org's, and not permitted alike — the api
    // answers 404 for all three so a caller cannot probe what exists.
    const booking = await getBooking(bookingId);
    if (!booking) notFound();

    // Read through the data layer, which is where this codebase keeps clock
    // reads. A past appointment offers different controls (#241), but nothing
    // about its OUTCOME is decided by the clock — only a person sets that.
    return (
        <BookingDetailView
            booking={booking}
            past={hasEnded(booking)}
            packs={await packsFor(booking)}
        />
    );
}

/**
 * What the booking says about class packs (ADR-007): the pack paying for it,
 * and — when none is, it is still on, and this person may spend packs — the
 * booker's packs that cover this session. A failed read offers nothing
 * rather than failing the booking.
 */
async function packsFor(booking: BookingDetail) {
    const organization = await resolveActiveOrganization();
    if (!canReadPacks(organization)) return undefined;
    const canWrite = canWritePacks(organization);
    const live = booking.packRedemption?.reversedAt
        ? null
        : (booking.packRedemption?.purchase ?? null);
    const paidWith = live ? { name: live.pack.name } : null;
    if (
        paidWith ||
        !canWrite ||
        booking.status !== "CONFIRMED" ||
        !booking.contact
    ) {
        return { paidWith, usable: [], canWrite };
    }
    const held = await readPurchasesFor(booking.contact.id, booking.serviceId);
    return {
        paidWith,
        usable: usablePacks(held ?? [], booking.startAt).map((p) => ({
            id: p.id,
            label: packOffer(p, booking.timezone),
        })),
        canWrite,
    };
}
