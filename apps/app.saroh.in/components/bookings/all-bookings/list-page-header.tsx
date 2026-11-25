"use client";

import { PageHeader } from "@saroh/ui/page-header";
import type { ReactNode } from "react";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import type { BookingsOpens } from "@/lib/services/bookings-opens";

import { BookingsModeSwitch, BookingsPhoneBar } from "./bookings-view-switch";
import { ListOptions } from "./list-options";

/**
 * The List's header. On a phone it is the Calendar's first row
 * (BKVListBPhone): Calendar | List across the width and "…" beside it,
 * with "All bookings" kept for a screen reader and "Times in IST" in the
 * "…" sheet. At a desk, the page header as before.
 */
export function ListPageHeader({
    opens,
    me,
    zone,
    newBooking,
}: {
    opens: BookingsOpens;
    me: { id: string; name: string } | null;
    /** "IST". */
    zone: string;
    /** New booking, for someone who may book; it floats on a phone. */
    newBooking: ReactNode;
}) {
    const phone = usePhone();
    const options = <ListOptions opens={opens} me={me} zone={zone} />;
    if (phone) {
        return (
            <div data-list-header="" className="mb-3">
                <h1 data-ph-unmask="" className="sr-only">
                    All bookings
                </h1>
                <BookingsPhoneBar current="list" options={options} />
                {newBooking}
            </div>
        );
    }
    return (
        <PageHeader
            title="All bookings"
            holdsData={false}
            meta={<BookingsModeSwitch current="list" />}
            description={`Times in ${zone}`}
            actions={
                <>
                    {options}
                    {newBooking}
                </>
            }
        />
    );
}
