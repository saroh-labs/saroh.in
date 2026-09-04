import { notFound } from "next/navigation";

import { BookingDetailView } from "@/components/bookings/booking-detail";
import { hasEnded } from "@/lib/services/booking-state";
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
    return <BookingDetailView booking={booking} past={hasEnded(booking)} />;
}
