"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BookingCancelSheet } from "./booking-cancel-sheet";
import type { BookingsApi } from "./bookings-api";
import type { AccountBookingRow } from "./bookings-model";
import {
    bookingOver,
    BOOKINGS_HREF,
    bookingSub,
    bookingTag,
    bookingTitle,
    cancelledText,
    cancelNote,
    moveClassHref,
    movedText,
} from "./bookings-model";
import { CallSheet, TimesSheet } from "./move-sheet";
import { AccountCard, BackLink, buttonClasses, Tag } from "./parts";

/**
 * One booking on a page of its own (DEC-142), at
 * `/account/bookings/‹ref›`, so an email can link straight to it: what it
 * is, when and with whom, what was paid, and — while it is still to come —
 * Move and Cancel, in the same sheets the Bookings tab opens, here on this
 * page.
 *
 * A booking that isn't theirs, or isn't there, says so here with the way
 * back; one that couldn't be read says that instead. Neither reads as the
 * other. One that is over reads its date alone until the business marks it.
 */

export type BookingLookup =
    | { ok: true; booking: AccountBookingRow }
    | { ok: false; reason: "missing" | "unavailable" };

/** What a lookup that found nothing says. */
export function bookingProblem(reason: "missing" | "unavailable"): string {
    return reason === "missing"
        ? "We couldn't find that booking in your account."
        : "This booking couldn't be loaded. Refresh the page to try again.";
}

type Open = "move" | "call" | "cancel" | null;

export function AccountBookingPage({
    lookup,
    businessName,
    phone,
    api,
    bookingsTab,
    now,
}: {
    lookup: BookingLookup;
    businessName: string;
    /** The business's public phone, for "Call"; null when it shows none. */
    phone: string | null;
    api: BookingsApi;
    /** This business shows the Bookings tab, so there is a list to go back to. */
    bookingsTab: boolean;
    /** When the page was drawn (ISO), so "over" doesn't shift on hydration. */
    now: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState<Open>(null);
    const [said, setSaid] = useState<string | null>(null);

    const back = bookingsTab ? (
        <BackLink href={BOOKINGS_HREF}>Bookings</BackLink>
    ) : (
        <BackLink href="/account">Home</BackLink>
    );

    if (!lookup.ok) {
        const missing = lookup.reason === "missing";
        return (
            <div className="grid gap-1.5">
                {back}
                <AccountCard
                    labelledBy="account-booking"
                    title={missing ? "Booking not found" : "Booking"}
                    lead={
                        <span role={missing ? undefined : "status"}>
                            {bookingProblem(lookup.reason)}
                        </span>
                    }
                />
            </div>
        );
    }

    const row = lookup.booking;
    const over = bookingOver(row, new Date(now));
    const tag = bookingTag(row, over);
    const sub = bookingSub(row);

    function done(words: string) {
        setOpen(null);
        setSaid(words);
        // The page reads the booking again: its new time, or that it is
        // cancelled.
        router.refresh();
    }

    const move =
        row.move === "page" ? (
            <Link
                href={moveClassHref(row.ref)}
                className={buttonClasses(false)}
            >
                Move
            </Link>
        ) : row.move ? (
            <button
                type="button"
                className={buttonClasses(false)}
                onClick={() => setOpen(row.move === "call" ? "call" : "move")}
            >
                Move
            </button>
        ) : null;
    const cancel = row.cancel ? (
        <button
            type="button"
            className={buttonClasses(false)}
            onClick={() => setOpen("cancel")}
        >
            Cancel
        </button>
    ) : null;

    return (
        <div className="grid gap-1.5">
            {back}
            {said ? (
                <p role="status" className="text-site-body mb-1.5 text-[15px]">
                    {said}
                </p>
            ) : null}
            <AccountCard
                labelledBy="account-booking"
                title={bookingTitle(row)}
                lead={
                    tag || sub ? (
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            {tag ? <Tag tone="quiet">{tag}</Tag> : null}
                            {sub ? <span>{sub}</span> : null}
                        </span>
                    ) : undefined
                }
                actions={
                    move || cancel ? (
                        <>
                            {move}
                            {cancel}
                        </>
                    ) : undefined
                }
            >
                {row.cancel ? (
                    <p className="text-site-body mt-3 max-w-[60ch] text-[14px] leading-normal">
                        {cancelNote(row.cancel, row.timezone)}
                    </p>
                ) : null}
            </AccountCard>

            <TimesSheet
                open={open === "move"}
                title={`Move ${row.service}`}
                lead={
                    row.staff
                        ? `Same service, with ${row.staff}.`
                        : "Same service."
                }
                load={() => api.moveTimes(row.ref)}
                cta={(label) => `Move to ${label}`}
                confirm={(startAt) => api.move(row.ref, startAt)}
                onDone={(label, told) =>
                    done(movedText(label, businessName, told))
                }
                onClose={() => setOpen(null)}
                businessName={businessName}
            />
            <CallSheet
                open={open === "call"}
                title={`Move ${row.service}`}
                lead={bookingTitle(row)}
                businessName={businessName}
                phone={phone}
                onClose={() => setOpen(null)}
            />
            <BookingCancelSheet
                row={open === "cancel" ? row : null}
                cancel={api.cancel}
                onDone={(result) => done(cancelledText(result))}
                onClose={() => setOpen(null)}
            />
        </div>
    );
}
