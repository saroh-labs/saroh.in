"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { markVisitAttended } from "@/lib/orders/actions";
import type { OrderVisits } from "@/lib/orders/read";
import {
    attendedToast,
    visitsNextLabel,
    visitsNextNote,
} from "@/lib/orders/visits";

import { actionClass } from "./parts";

/**
 * The header's next action for a treatment: "Mark visit N attended" (once
 * it has started, `order:stage`) or "Book visit N" (New booking with the
 * service, the customer and the order set, `booking:write`). Null when there
 * is nothing this person can do next.
 */
export function VisitsNextAction({
    orderId,
    orderNumber,
    visits,
    first,
    canMark,
    canBook,
    now,
}: {
    orderId: string;
    orderNumber: string;
    visits: OrderVisits;
    first: string;
    canMark: boolean;
    canBook: boolean;
    now: Date;
}) {
    // Beside the header only while the next visit hasn't started (the
    // design's wait note): "Next visit today, 18:00. You can mark it
    // attended once it starts."
    const note = visits.next.upcoming
        ? visitsNextNote(visits, visits.service.timezone, now)
        : null;
    const action = (
        <NextButton
            orderId={orderId}
            orderNumber={orderNumber}
            visits={visits}
            first={first}
            canMark={canMark}
            canBook={canBook}
        />
    );
    return (
        <>
            {action}
            {note ? (
                <span className="max-w-[260px] text-pretty text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                    {note}
                </span>
            ) : null}
        </>
    );
}

function NextButton({
    orderId,
    orderNumber,
    visits,
    first,
    canMark,
    canBook,
}: {
    orderId: string;
    orderNumber: string;
    visits: OrderVisits;
    first: string;
    canMark: boolean;
    canBook: boolean;
}) {
    const router = useRouter();
    const [busy, startTransition] = useTransition();
    const label = visitsNextLabel(visits);
    const attend = visits.next.attend;
    const book = visits.next.book;

    if (attend !== null && canMark) {
        const mark = () =>
            startTransition(async () => {
                const res = await markVisitAttended(orderId, attend);
                if (!res.ok) {
                    showError(res.error);
                } else {
                    showSuccess(attendedToast(attend, res.data.done));
                }
                router.refresh();
            });
        return (
            <Button
                type="button"
                className={actionClass("primary")}
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={mark}
            >
                {label}
            </Button>
        );
    }
    if (book !== null && canBook) {
        return (
            <NewBookingDialog
                services={[
                    {
                        id: visits.service.id,
                        name: visits.service.name,
                        timezone: visits.service.timezone,
                        minutes: visits.service.durationMinutes,
                        priceCents: visits.service.priceCents,
                    },
                ]}
                people={{ canSearch: false, payLink: false }}
                visit={{
                    orderId,
                    orderNumber,
                    visitNumber: book,
                    visits: visits.total,
                    who: first,
                }}
                primaryTrigger
                triggerClassName={actionClass("primary")}
            />
        );
    }
    return null;
}
