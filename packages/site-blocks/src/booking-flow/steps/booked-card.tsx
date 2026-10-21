"use client";

import type { BookingLookup } from "../../account/booking-page";
import { bookingProblem } from "../../account/booking-page";
import {
    BOOKINGS_HREF,
    bookingSub,
    bookingTag,
    bookingTitle,
} from "../../account/bookings-model";
import { cn } from "../../lib/utils";
import { MOVE_OR_CANCEL } from "../model";
import { card, focusRing, quietFill, textAction } from "../styles";

/**
 * The booked step read again from its reference (U9): `?step=done&ref=`
 * after a reload, or Forward to it once the page let it go. The booking is
 * read through the customer's own session (`me/bookings/:ref`), so only
 * its booker sees it: signed out, or someone else's, it says it couldn't
 * find the booking — never a blank, and never anyone's details. A read
 * that failed says so instead; the two are never the same answer.
 */
export function BookedCard({
    lookup,
    headingRef,
    onAgain,
}: {
    /** `null` while it is read. */
    lookup: BookingLookup | null;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    onAgain: () => void;
}) {
    const again = (
        <button
            type="button"
            onClick={onAgain}
            className={cn(textAction, "h-11 px-2")}
        >
            Book something
        </button>
    );
    const heading = (text: string) => (
        <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-site-heading text-site-fg text-[calc(1.5rem*var(--site-heading-scale,1))] font-semibold leading-[1.15] tracking-[-0.03em] outline-none [text-wrap:balance]"
        >
            {text}
        </h2>
    );

    if (lookup === null) {
        return (
            <div
                className={cn(card, "grid gap-3 px-[26px] py-7")}
                role="status"
                aria-label="Loading your booking"
            >
                <div className={cn("h-7 w-3/5 rounded-md", quietFill)} />
                <div className={cn("h-4 w-4/5 rounded-md", quietFill)} />
            </div>
        );
    }

    if (!lookup.ok) {
        return (
            <div data-booking-missing="" className={cn(card, "px-[26px] py-7")}>
                {heading(
                    lookup.reason === "missing"
                        ? "We couldn't find this booking"
                        : "We couldn't load this booking",
                )}
                <p
                    role={lookup.reason === "missing" ? undefined : "status"}
                    className="text-site-body mt-2 text-sm leading-[1.55]"
                >
                    {lookup.reason === "missing"
                        ? "Sign in with the email you booked with to see it in your bookings."
                        : bookingProblem("unavailable")}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a
                        href={BOOKINGS_HREF}
                        className={cn(
                            "text-site-fg rounded-sm px-2 text-sm font-semibold underline underline-offset-2",
                            focusRing,
                        )}
                    >
                        Your bookings
                    </a>
                    {again}
                </div>
            </div>
        );
    }

    const row = lookup.booking;
    const tag = bookingTag(row);
    const sub = bookingSub(row);
    return (
        <div data-booking-done="" className={cn(card, "px-[26px] py-7")}>
            {heading(
                row.state === "booked" || !tag
                    ? "You're booked."
                    : `This booking is ${tag.toLowerCase()}.`,
            )}
            <p className="text-site-fg mt-1.5 text-base font-medium leading-[1.55]">
                {bookingTitle(row)}
            </p>
            {sub ? (
                <p className="text-site-body mt-1 text-[13.5px] leading-[1.55]">
                    {sub}
                </p>
            ) : null}
            <p className="text-site-body border-site-border mt-5 border-t pt-4 text-sm leading-[1.55]">
                Need to change it?{" "}
                <a
                    href={`${BOOKINGS_HREF}/${encodeURIComponent(row.ref)}`}
                    className={cn(
                        "text-site-fg rounded-sm font-semibold underline underline-offset-2",
                        focusRing,
                    )}
                >
                    {MOVE_OR_CANCEL}
                </a>
                .
            </p>
            <div className="mt-3">{again}</div>
        </div>
    );
}
