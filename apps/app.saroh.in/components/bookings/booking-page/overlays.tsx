"use client";

import { useRouter } from "next/navigation";

import type { SendHeld } from "@/components/bookings/sheets/cancel-sheet";
import { CancelSheet } from "@/components/bookings/sheets/cancel-sheet";
import { TakePayment } from "@/components/bookings/take-payment";
import { formatDateTime } from "@/lib/format/datetime";
import { paidLine } from "@/lib/services/booking-money";
import type { PageBooking } from "@/lib/services/booking-page";
import type { DeskTake } from "@/lib/services/desk-pay";
import type { PeekPerson } from "@/lib/services/peek";

import { ChangeWhoSheet } from "@/components/bookings/sheets/change-who";

import { MoveSheet } from "./move-sheet";

/** Which of the page's sheets is open. */
export type PageSheet = "move" | "who" | "cancel" | "take" | null;

/**
 * The sheets a booking's page opens (U12): Move (U3's time picker),
 * Cancel (U3's one cancel sheet, the money question as the business's
 * policy says) and Take payment. Each is a bottom sheet on a phone and
 * the right-hand panel at a desk.
 */
export function PageOverlays({
    open,
    onOpen,
    booking,
    who,
    timezone,
    now,
    canMove,
    canReassign = false,
    reassignOnly = null,
    canCancel,
    canRefund,
    canReadOrder,
    take,
    desk,
    person,
    send,
}: {
    open: PageSheet;
    onOpen: (sheet: PageSheet) => void;
    booking: PageBooking;
    who: string;
    timezone: string;
    now?: number;
    canMove: boolean;
    /** Change who it's with, or Assign someone (#1157). */
    canReassign?: boolean;
    /** The one person it may go to; null: anyone free. */
    reassignOnly?: string | null;
    canCancel: boolean;
    canRefund: boolean;
    canReadOrder: boolean;
    /** What Take takes now, for someone who may; null: no sheet. */
    take: DeskTake | null;
    desk?: { canLink: boolean; online?: boolean };
    person: PeekPerson | null;
    /** The page's own hold, so a plain cancel's Undo outlives the sheet. */
    send: SendHeld;
}) {
    const router = useRouter();
    const money = booking.money;
    const close = () => onOpen(null);
    return (
        <>
            {canMove ? (
                <MoveSheet
                    open={open === "move"}
                    booking={{
                        id: booking.id,
                        serviceId: booking.service.id,
                        serviceName: booking.service.name,
                        startAt: booking.startAt,
                        who,
                        staff: booking.staff ?? null,
                        freeCancelUntil: booking.freeCancelUntil ?? null,
                    }}
                    timezone={timezone}
                    reach={person?.reach ?? null}
                    now={now}
                    onClose={close}
                />
            ) : null}
            {canReassign ? (
                <ChangeWhoSheet
                    open={open === "who"}
                    target={{
                        id: booking.id,
                        serviceId: booking.service.id,
                        serviceName: booking.service.name,
                        startAt: booking.startAt,
                        who,
                        staff: booking.staff ?? null,
                    }}
                    timezone={timezone}
                    reach={person?.reach ?? null}
                    now={now}
                    send={send}
                    only={reassignOnly}
                    onClose={close}
                />
            ) : null}
            {canCancel ? (
                <CancelSheet
                    open={open === "cancel"}
                    booking={{
                        id: booking.id,
                        who,
                        when: [
                            formatDateTime(booking.startAt, timezone, {
                                weekday: "short",
                            }),
                            money ? paidLine(money) : null,
                        ]
                            .filter(Boolean)
                            .join(" · "),
                        // Left out, the sheet reads what was paid.
                        ...(money !== undefined ? { money } : {}),
                        freeCancelUntil: booking.freeCancelUntil ?? null,
                        timezone,
                    }}
                    canRefund={canRefund}
                    canReadOrder={canReadOrder}
                    send={send}
                    onClose={close}
                    onCancelled={() => {
                        close();
                        router.refresh();
                    }}
                />
            ) : null}
            {take && desk ? (
                <TakePayment
                    panel
                    bookingId={booking.id}
                    take={take}
                    currency={money?.currency ?? null}
                    who={who}
                    canLink={desk.canLink}
                    online={desk.online}
                    open={open === "take"}
                    onOpenChange={(o) => onOpen(o ? "take" : null)}
                />
            ) : null}
        </>
    );
}
