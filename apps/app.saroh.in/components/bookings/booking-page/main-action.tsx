"use client";

import { Button } from "@saroh/ui/button";
import { CalendarPlus, IndianRupee, Plus } from "lucide-react";
import type { ReactElement } from "react";

import type { MoreRow } from "@/components/bookings/quick-look/quick-look-more";
import { QuickLookMore } from "@/components/bookings/quick-look/quick-look-more";
import type { PageMain } from "@/lib/services/booking-page";
import { TakePaymentLocked } from "./take-payment-locked";

/** The board's buttons: 48px on a phone, 44px at a desk. */
const BIG = "h-12 gap-2 text-[15px] min-[760px]:h-11 min-[760px]:text-[14.5px]";

/**
 * The one main action of a booking's page (U12): Take ₹X, locked with
 * why for a role that can't take it, Book their next visit, Book them
 * again, or Book a new time.
 */
export function MainButton({
    main,
    amount,
    first,
    frontDeskId,
    onTake,
    onBook,
}: {
    main: PageMain;
    /** "₹500", or null when the role reads no money. */
    amount: string | null;
    first: string;
    /** The line that says why Take is locked, once, in the page. */
    frontDeskId: string;
    onTake: () => void;
    onBook: () => void;
}) {
    switch (main) {
        case "take":
            return (
                <Button
                    type="button"
                    data-ph-unmask=""
                    className={BIG}
                    onClick={onTake}
                >
                    <IndianRupee aria-hidden className="size-4" />
                    {amount ? `Take ${amount}` : "Take payment"}
                </Button>
            );
        case "take-locked":
            return (
                <TakePaymentLocked
                    amount={amount}
                    lock
                    describedBy={frontDeskId}
                    triggerClassName={BIG}
                />
            );
        case "next":
            return (
                <Button type="button" className={BIG} onClick={onBook}>
                    <CalendarPlus aria-hidden className="size-4" />
                    Book their next visit
                </Button>
            );
        case "again":
            return (
                <Button
                    type="button"
                    data-ph-mask=""
                    className={BIG}
                    onClick={onBook}
                >
                    <Plus aria-hidden className="size-4" />
                    {first ? `Book ${first} again` : "Book them again"}
                </Button>
            );
        case "rebook":
            return (
                <Button type="button" className={BIG} onClick={onBook}>
                    <Plus aria-hidden className="size-4" />
                    Book a new time
                </Button>
            );
    }
}

/**
 * More (BKMBookingDetail's sheet, BKDBooking's menu): the quick look's
 * own, a sheet from the foot of a phone and a menu under the button at a
 * desk, Cancel last and in red.
 */
export function PageMore({
    title,
    rows,
    trigger,
}: {
    title: string;
    rows: readonly MoreRow[];
    trigger?: ReactElement;
}) {
    return (
        <QuickLookMore
            title={title}
            rows={rows}
            trigger={trigger}
            className="min-[760px]:h-11"
        />
    );
}
