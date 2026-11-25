"use client";

import type { ReactNode } from "react";

import { NewBookingHost } from "@/components/bookings/new-booking/new-booking-host";
import type { NewBookingSetup } from "@/components/bookings/new-booking/setup";
import { flowStaff } from "@/components/bookings/new-booking/setup";
import type { BookingAsk } from "@/lib/bookings/queries";
import {
    BookingSaveContext,
    useBooking,
    useBookingSaveWithQuery,
} from "@/lib/bookings/use-bookings";
import { hasEnded } from "@/lib/services/booking-state";

import { BookingDetailView } from "./booking-detail";

/**
 * A booking's page on React Query (DEC-259, U26): `BookingDetailView`
 * drawn from the booking's query, so a move, a change of who, an outcome,
 * a pack or a payment reads it again (`useBookingSaveWithQuery`), never
 * the whole page; the list and the diary are only marked stale. What the
 * person may do is the page's, decided on the server; the booking is read
 * in the browser, behind the route's loader (`skeleton`): its heading,
 * actions and cards all come from it. Opened again, the last read draws
 * at once and is read again behind it.
 */
export function BookingDetailContainer({
    ask,
    userId,
    can,
    setup,
    skeleton,
}: {
    ask: BookingAsk;
    /** The route's loader, until the booking is read. */
    skeleton: ReactNode;
    /** The viewer, to find their own place on the diary (#1157). */
    userId: string;
    can: {
        write: boolean;
        refund: boolean;
        readOrder: boolean;
        /** May take at the desk; `canLink` while the plan and a provider take a link. */
        desk: { canTake: boolean; canLink: boolean; online: boolean };
        /** `service:write`: anyone's booking to anyone (#1157). */
        reassignAny: boolean;
    };
    /** New booking's setup, less what the read brings; null: may not book. */
    setup: Omit<
        NewBookingSetup,
        "staff" | "timezone" | "now" | "meet" | "canUsePacks"
    > | null;
}) {
    const saves = useBookingSaveWithQuery();
    const read = useBooking(ask);
    const { data } = read;
    // A first read that failed is the page failing (`error.tsx`); a read
    // again that fails keeps the last answer.
    if (read.isError && !data) throw read.error;
    if (!data) return skeleton;
    const { booking, now } = data;
    // Times in the business's zone, labelled (Q10): the service's.
    const timezone = booking.service.timezone || booking.timezone;
    const me =
        data.staff?.find(
            (p) => p.status === "ACTIVE" && p.membership?.userId === userId,
        )?.id ?? null;

    const view = (
        <BookingDetailView
            booking={booking}
            past={hasEnded(booking, now)}
            now={now}
            timezone={timezone}
            packs={data.packs}
            canWrite={can.write}
            canRefund={can.refund}
            canReadOrder={can.readOrder}
            desk={{
                ...can.desk,
                canLink: can.desk.canLink && !!booking.money?.take?.byLink,
            }}
            waitlist={data.waitlist}
            person={data.person}
            reassign={{ any: can.reassignAny, me }}
            meeting={data.meeting}
        />
    );
    return (
        <BookingSaveContext.Provider value={saves}>
            {setup ? (
                <NewBookingHost
                    setup={{
                        ...setup,
                        staff: flowStaff(data.staff),
                        timezone,
                        now,
                        meet: data.meet ?? false,
                        // Packs read and spendable here (ADR-007, E12).
                        canUsePacks: data.packs?.canWrite ?? false,
                    }}
                >
                    {view}
                </NewBookingHost>
            ) : (
                view
            )}
        </BookingSaveContext.Provider>
    );
}
