import { notFound } from "next/navigation";

import { BookingDetailContainer } from "@/components/bookings/booking-page/booking-detail-container";
import { flowServices } from "@/components/bookings/new-booking/setup";
import { takesOnlinePayment } from "@/lib/billing/access";
import { readBookingOnce } from "@/lib/bookings/access";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { permits, permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import {
    canReadOrders,
    canRefundPayments,
    canTakeDeskPayments,
} from "@/lib/services/booking-money";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

/** What was booked, in the tab: the service, never who booked it or when. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ bookingId: string }>;
}) {
    const { bookingId } = await params;
    return recordTitle(
        () => readBookingOnce(bookingId),
        (booking) => `${booking.service.name} booking`,
        "Booking",
    );
}

/**
 * One booking (#121; U12 of the bookings plan, #1028: BKMBookingDetail
 * and BKDBooking): "who is this, and can we move it?", the two things a
 * merchant is asked on the phone.
 *
 * On React Query (DEC-259, U26), loaded in the browser: the gates and what
 * this person may do are decided here, the 404 from the read the tab's
 * title makes anyway (`readBookingOnce`: missing, another business's and
 * not permitted alike). The booking and what its page shows beside it
 * (`/api/bookings/[bookingId]`: packs, a class's waitlist, the person, who
 * is on the diary, its Meet) are `BookingDetailContainer`'s query, so a
 * move, a change of who, an outcome or a payment reads it again, never the
 * whole page.
 */
export default async function BookingPage({
    params,
}: {
    params: Promise<{ bookingId: string }>;
}) {
    const session = await requireSession();
    const { bookingId } = await params;
    const [booking, organization] = await Promise.all([
        readBookingOnce(bookingId),
        resolveActiveOrganization(),
    ]);
    if (!booking) notFound();

    const may = permitsFor(organization);
    // Moving, cancelling and the outcome are `booking:write`
    // (`booking-access.ts`), asked of the resolved permissions as the diary
    // asks for New booking.
    const canWrite = permits(organization, "booking:write");
    // Taking payment at the desk (P2), and sending a payment link instead
    // when the plan takes online payment and a provider is connected (R33).
    const canTake = canTakeDeskPayments(organization);
    const [online, billing] = await Promise.all([
        onlinePayReady(),
        billingAccessOrNull(),
    ]);
    const can = {
        write: canWrite,
        refund: canRefundPayments(organization),
        readOrder: canReadOrders(organization),
        desk: {
            canTake,
            // A link is offered where the booking's money says it can be.
            canLink: canTake && online,
            online: takesOnlinePayment(billing),
        },
        reassignAny: may("service:write"),
    };
    if (!canWrite) {
        return (
            <BookingDetailContainer
                skeleton={<Loading />}
                ask={{ bookingId }}
                userId={session.user.id}
                can={can}
                setup={null}
            />
        );
    }

    // Book their next visit and Book a new time open New booking here
    // (U8), with who, what and with whom already filled; its people come
    // with the booking's read, as do whether it may spend a class pack
    // and offer a Meet.
    const services = await listServices().catch(() => []);
    return (
        <BookingDetailContainer
            skeleton={<Loading />}
            ask={{ bookingId }}
            userId={session.user.id}
            can={can}
            setup={{
                services: flowServices(services),
                people: {
                    canSearch: may("contact:read"),
                    payLink: may("invoice:write") && online,
                    canTakePayment: canTake,
                    onlinePay: online,
                },
                showMoney: may("payment:read") || canTake,
                business: organization?.name ?? null,
            }}
        />
    );
}
