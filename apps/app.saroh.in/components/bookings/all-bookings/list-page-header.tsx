"use client";

import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import type { ReactNode } from "react";

import { usePhoneOrUnknown } from "@/components/bookings/calendar/header/use-phone";
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
    // Null on the server and while hydrating: both frames, CSS shows one.
    const known = usePhoneOrUnknown();
    const options = <ListOptions opens={opens} me={me} zone={zone} />;
    const both = known === null;
    const phoneFrame = (
        // `contents`: the sticky row sticks across the whole page.
        <div
            data-list-header="phone"
            className={cn("contents", both && "min-[760px]:hidden")}
        >
            <h1 data-ph-unmask="" className="sr-only">
                All bookings
            </h1>
            <BookingsPhoneBar current="list" options={options} />
            {newBooking}
            <span aria-hidden className="block h-3" />
        </div>
    );
    const deskFrame = (
        <PageHeader
            data-list-header="desk"
            className={cn(both && "max-[759px]:hidden")}
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
    if (both) {
        return (
            <>
                {phoneFrame}
                {deskFrame}
            </>
        );
    }
    return known ? phoneFrame : deskFrame;
}
