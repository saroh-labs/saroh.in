"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import { CancelSheet } from "@/components/bookings/sheets/cancel-sheet";
import { useHold } from "@/components/shared/use-hold";
import type { BookingMoney } from "@/lib/services/booking-money";

/**
 * Cancel a single booking (S4-003): the button, and the one cancel sheet
 * (U3, `sheets/cancel-sheet.tsx`) it opens. Every cancel asks about the
 * money when something was paid online (BA-01): the booking's page passes
 * what it holds, and the list, which holds none, has the sheet read it.
 *
 * The hold of a plain cancel (nothing paid: ten seconds with Undo, since
 * it tells the customer) is kept here, beside the button, so the Undo
 * outlives the sheet; the button says "Cancelling…" while it waits.
 */
export function CancelBookingControl({
    bookingId,
    who = "",
    when,
    money,
    freeCancelUntil,
    timezone,
    canRefund = false,
    canReadOrder = false,
}: {
    bookingId: string;
    /** Who it is for, for the sheet's title. */
    who?: string;
    /** The line under the title: the day and time, what was paid. */
    when?: string;
    /** Left out, the sheet reads it as it opens (the list). */
    money?: BookingMoney;
    freeCancelUntil?: string | null;
    timezone?: string;
    /** `payment:manage`: may refund what a late cancel keeps. */
    canRefund?: boolean;
    /** `order:read`: a treatment's visit links to its order (E9). */
    canReadOrder?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const { send, pending } = useHold();
    const held = pending.includes(`cancel-booking:${bookingId}`);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={held}
                className="wk-press"
            >
                {held ? "Cancelling…" : "Cancel"}
            </Button>
            <CancelSheet
                open={open}
                booking={{
                    id: bookingId,
                    who,
                    when,
                    ...(money !== undefined ? { money } : {}),
                    freeCancelUntil: freeCancelUntil ?? null,
                    timezone: timezone ?? "UTC",
                }}
                canRefund={canRefund}
                canReadOrder={canReadOrder}
                send={send}
                onClose={() => setOpen(false)}
            />
        </>
    );
}
