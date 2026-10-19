import { notFound } from "next/navigation";
import { cache } from "react";

import { BookingDetailView } from "@/components/bookings/booking-detail";
import { NewBookingHost } from "@/components/bookings/new-booking/new-booking-host";
import {
    flowServices,
    flowStaff,
} from "@/components/bookings/new-booking/setup";
import { takesOnlinePayment } from "@/lib/billing/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packOffer, usablePacks } from "@/lib/class-packs/balance";
import { readPurchasesFor } from "@/lib/class-packs/service";
import { packsOn } from "@/lib/class-packs/switched-on";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permits, permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import {
    canReadOrders,
    canRefundPayments,
    canTakeDeskPayments,
} from "@/lib/services/booking-money";
import type { PageBooking } from "@/lib/services/booking-page";
import { readBookingPage } from "@/lib/services/booking-page-read";
import { hasEnded } from "@/lib/services/booking-state";
import { readClassWaitlist } from "@/lib/services/class-waitlist";
import { readPeekPerson } from "@/lib/services/peek-person";
import { listServices, readNow } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { listStaff } from "@/lib/staff/service";

/**
 * One booking (#121; U12 of the bookings plan, #1028: BKMBookingDetail
 * and BKDBooking).
 *
 * Cancelling was the only thing a merchant could do to a booking, and there
 * was nowhere to do anything else from: the calendar was the whole of the
 * Appointments surface, so "who is this, and can we move it?" — the two things
 * a merchant is asked on the phone — had no screen to be answered on.
 *
 * The page fetches; the view decides how to render, matching the list.
 */
// One read for the tab's title and the page (it was read twice). A
// booking that isn't there is a 404; a read that failed throws to this
// segment's boundary, "Couldn't load this booking" with Try again.
const readBooking = cache((bookingId: string) => readBookingPage(bookingId));

/** What was booked, in the tab: the service, never who booked it or when. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ bookingId: string }>;
}) {
    const { bookingId } = await params;
    return recordTitle(
        () => readBooking(bookingId),
        (booking) => `${booking.service.name} booking`,
        "Booking",
    );
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
    const booking = await readBooking(bookingId);
    if (!booking) notFound();

    // Read through the data layer, which is where this codebase keeps clock
    // reads. A past appointment offers different controls (#241), but nothing
    // about its OUTCOME is decided by the clock — only a person sets that.
    const now = readNow();
    const organization = await resolveActiveOrganization();
    const may = permitsFor(organization);
    // Taking payment at the desk (P2), and sending a payment link instead when
    // the plan takes online payment and a provider is connected (R33).
    const canTake = canTakeDeskPayments(organization);
    const online = await onlinePayReady();
    const desk = {
        canTake,
        canLink: canTake && !!booking.money?.take?.byLink && online,
        online: takesOnlinePayment(await billingAccessOrNull()),
    };
    // Moving, cancelling and the outcome are `booking:write`
    // (`booking-access.ts`), asked of the resolved permissions as the diary
    // asks for New booking.
    const canWrite = permits(organization, "booking:write");
    // Times in the business's zone, labelled (Q10): the service's.
    const timezone = booking.service.timezone || booking.timezone;
    const [packs, waitlist, person] = await Promise.all([
        packsFor(booking),
        waitlistFor(booking),
        // Their phone, Needs attention and how a change reaches them
        // (`contact:read`); null when it can't be read, and the card then
        // says only what the booking holds.
        booking.contact && may("contact:read")
            ? readPeekPerson(booking.contact.id)
            : Promise.resolve(null),
    ]);

    const view = (
        <BookingDetailView
            booking={booking}
            past={hasEnded(booking, now)}
            now={now}
            timezone={timezone}
            packs={packs}
            canWrite={canWrite}
            canRefund={canRefundPayments(organization)}
            canReadOrder={canReadOrders(organization)}
            desk={desk}
            waitlist={waitlist}
            person={person}
        />
    );
    if (!canWrite) return view;

    // Book their next visit and Book a new time open New booking here
    // (U8), with who, what and with whom already filled.
    const [services, staffList] = await Promise.all([
        listServices().catch(() => []),
        listStaff().catch(() => null),
    ]);
    return (
        <NewBookingHost
            setup={{
                services: flowServices(services),
                staff: flowStaff(staffList?.staff ?? null),
                people: {
                    canSearch: may("contact:read"),
                    payLink: may("invoice:write") && online,
                    canTakePayment: canTake,
                    onlinePay: online,
                },
                canUsePacks:
                    canReadPacks(organization) &&
                    canUsePacksOnBookings(organization) &&
                    packsOn(await modulesOrUnknown()),
                timezone,
                showMoney: may("payment:read") || canTake,
                business: organization?.name ?? null,
                now,
            }}
        >
            {view}
        </NewBookingHost>
    );
}

/**
 * What the booking says about class packs (ADR-007): the pack paying for it,
 * and — when none is, it is still on, and this person may spend packs — the
 * booker's packs that cover this session. A failed read offers nothing
 * rather than failing the booking. With Class packs switched off (E12) it
 * still says which pack paid, and offers nothing to spend or take off.
 */
async function packsFor(booking: PageBooking) {
    const [organization, modules] = await Promise.all([
        resolveActiveOrganization(),
        modulesOrUnknown(),
    ]);
    if (!canReadPacks(organization)) return undefined;
    const canWrite = canUsePacksOnBookings(organization) && packsOn(modules);
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

/**
 * A class's line for this session (A12): read for a class still to come,
 * null when the read failed, and nothing for a one-to-one or a class that
 * has happened.
 */
async function waitlistFor(booking: PageBooking) {
    if (booking.service.capacity <= 1 || hasEnded(booking)) return undefined;
    return readClassWaitlist(booking.serviceId, booking.startAt);
}
