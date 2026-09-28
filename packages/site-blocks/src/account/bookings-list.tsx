"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BookingCancelSheet } from "./booking-cancel-sheet";
import type { BookingsApi } from "./bookings-api";
import type {
    AccountBookingRow,
    AccountBookings,
    AccountTreatment,
} from "./bookings-model";
import {
    BOOKINGS_HREF,
    bookingSub,
    bookingTag,
    bookingTitle,
    cancelledText,
    moveClassHref,
    treatmentLead,
    treatmentSub,
    treatmentVisitWords,
} from "./bookings-model";
import type { Block } from "./model";
import { CallSheet, TimesSheet } from "./move-sheet";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
    Unavailable,
} from "./parts";

/**
 * The account's Bookings tab (round-2 plan A, A6; Saroh Customer Site
 * design): Coming up, Past and Cancelled, and each treatment as its visits.
 *
 * - **Move:** a one-to-one opens free times with the same person (the Move
 *   sheet); a class moves on the booking page, "Moving: ‹class›", where its
 *   credit moves with it; inside the free-cancel window the sheet says to
 *   call the business. The deadline never moves with the booking.
 * - **Cancel:** the sheet says what cancelling now does, as the API worked
 *   it out: free or late, the money, a class credit.
 * - **A treatment:** done, today, booked and to book, and "Book visit N"
 *   once no visit is waiting.
 *
 * `?move=‹ref›` or `?cancel=‹ref›` (Home's next booking) opens that sheet.
 * Everything it changes goes through the site's server actions (`api`); the
 * page then reads the lists again.
 */

type Open =
    | { kind: "move" | "call" | "cancel"; row: AccountBookingRow }
    | { kind: "visit"; treatment: AccountTreatment; visit: number }
    | null;

export function AccountBookingsTab({
    bookings,
    title,
    businessName,
    phone,
    api,
    initial = null,
}: {
    bookings: Block<AccountBookings>;
    /** "Appointments" or "Bookings", as the tab is named. */
    title: string;
    businessName: string;
    /** The business's public phone, for "Call"; null when it shows none. */
    phone: string | null;
    api: BookingsApi;
    /** A sheet to open on arrival (`?move=` or `?cancel=`). */
    initial?: { kind: "move" | "cancel"; ref: string } | null;
}) {
    const router = useRouter();
    const [said, setSaid] = useState<string | null>(null);
    const comingUp = bookings.ok ? bookings.value.comingUp : [];

    const [open, setOpen] = useState<Open>(() => {
        const row = initial
            ? comingUp.find((r) => r.ref === initial.ref)
            : undefined;
        if (!initial || !row) return null;
        if (initial.kind === "cancel")
            return row.cancel ? { kind: "cancel", row } : null;
        if (row.move === "sheet") return { kind: "move", row };
        if (row.move === "call") return { kind: "call", row };
        return null;
    });

    // A class asked to move from Home goes to the booking page.
    useEffect(() => {
        if (initial?.kind !== "move") return;
        const row = comingUp.find((r) => r.ref === initial.ref);
        if (row?.move === "page") router.push(moveClassHref(row.ref));
        // Once, on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function close() {
        setOpen(null);
        if (initial) router.replace(BOOKINGS_HREF, { scroll: false });
    }

    function done(words: string) {
        setOpen(null);
        setSaid(words);
        router.replace(BOOKINGS_HREF, { scroll: false });
        router.refresh();
    }

    const book = (
        <Link href="/book" className={buttonClasses(true)}>
            Book another
        </Link>
    );

    return (
        <div className="grid gap-3.5">
            <h1 className="font-site-heading text-site-fg m-0 text-[26px] font-semibold tracking-[-0.02em]">
                {title}
            </h1>
            {said ? (
                <p role="status" className="text-site-body text-sm">
                    {said}
                </p>
            ) : null}

            {bookings.ok ? (
                <>
                    <AccountCard
                        labelledBy="bookings-coming-up"
                        title="Coming up"
                        sub={String(comingUp.length)}
                        lead={
                            comingUp.length === 0
                                ? "Nothing booked."
                                : undefined
                        }
                        actions={book}
                    >
                        {comingUp.map((row) => (
                            <BookingRow
                                key={row.ref}
                                row={row}
                                onMove={() =>
                                    setOpen({
                                        kind:
                                            row.move === "call"
                                                ? "call"
                                                : "move",
                                        row,
                                    })
                                }
                                onCancel={() =>
                                    setOpen({ kind: "cancel", row })
                                }
                            />
                        ))}
                    </AccountCard>
                    <AccountCard
                        labelledBy="bookings-past"
                        title="Past"
                        lead={
                            bookings.value.past.length === 0
                                ? "Nothing yet."
                                : undefined
                        }
                    >
                        {bookings.value.past.map((row) => (
                            <BookingRow key={row.ref} row={row} />
                        ))}
                    </AccountCard>
                    {bookings.value.cancelled.length > 0 ? (
                        <AccountCard
                            labelledBy="bookings-cancelled"
                            title="Cancelled"
                        >
                            {bookings.value.cancelled.map((row) => (
                                <BookingRow key={row.ref} row={row} />
                            ))}
                        </AccountCard>
                    ) : null}
                    {bookings.value.treatments.map((t) => (
                        <TreatmentCard
                            key={t.ref}
                            treatment={t}
                            onBook={(visit) =>
                                setOpen({ kind: "visit", treatment: t, visit })
                            }
                        />
                    ))}
                </>
            ) : (
                <AccountCard
                    labelledBy="bookings-coming-up"
                    title="Coming up"
                    actions={book}
                >
                    <Unavailable what="Your bookings" />
                </AccountCard>
            )}

            <TimesSheet
                open={open?.kind === "move"}
                title={
                    open?.kind === "move" ? `Move ${open.row.service}` : "Move"
                }
                lead={
                    open?.kind === "move" && open.row.staff
                        ? `Same service, with ${open.row.staff}.`
                        : "Same service."
                }
                load={() =>
                    open?.kind === "move"
                        ? api.moveTimes(open.row.ref)
                        : Promise.resolve({ ok: false, message: "" })
                }
                cta={(label) => `Move to ${label}`}
                confirm={async (startAt) =>
                    open?.kind === "move"
                        ? api.move(open.row.ref, startAt)
                        : { ok: false, message: "" }
                }
                onDone={(label) => done(`Moved to ${label}.`)}
                onClose={close}
                businessName={businessName}
                phone={phone}
            />
            <TimesSheet
                open={open?.kind === "visit"}
                title={
                    open?.kind === "visit"
                        ? `Book visit ${open.visit}`
                        : "Book a visit"
                }
                lead={
                    open?.kind === "visit"
                        ? `${open.treatment.name}, visit ${open.visit} of ${open.treatment.visits.length}.`
                        : ""
                }
                groupLabel="Time"
                load={() =>
                    open?.kind === "visit"
                        ? api.visitTimes(open.treatment.ref)
                        : Promise.resolve({ ok: false, message: "" })
                }
                cta={(label) => `Book ${label}`}
                confirm={async (startAt) =>
                    open?.kind === "visit"
                        ? api.bookVisit(open.treatment.ref, startAt)
                        : { ok: false, message: "" }
                }
                onDone={(label) =>
                    done(
                        open?.kind === "visit"
                            ? `Visit ${open.visit} booked for ${label}.`
                            : `Booked for ${label}.`,
                    )
                }
                onClose={close}
                businessName={businessName}
                phone={phone}
            />
            <CallSheet
                open={open?.kind === "call"}
                title={
                    open?.kind === "call" ? `Move ${open.row.service}` : "Move"
                }
                lead={open?.kind === "call" ? bookingTitle(open.row) : ""}
                businessName={businessName}
                phone={phone}
                onClose={close}
            />
            <BookingCancelSheet
                row={open?.kind === "cancel" ? open.row : null}
                cancel={api.cancel}
                onDone={(result) => done(cancelledText(result))}
                onClose={close}
            />
        </div>
    );
}

function BookingRow({
    row,
    onMove,
    onCancel,
}: {
    row: AccountBookingRow;
    onMove?: () => void;
    onCancel?: () => void;
}) {
    const move =
        row.move === "page" ? (
            <Link
                href={moveClassHref(row.ref)}
                className={smallButton}
                aria-label={`Move ${bookingTitle(row)}`}
            >
                Move
            </Link>
        ) : row.move && onMove ? (
            <button
                type="button"
                onClick={onMove}
                className={smallButton}
                aria-label={`Move ${bookingTitle(row)}`}
            >
                Move
            </button>
        ) : null;
    const cancel =
        row.cancel && onCancel ? (
            <button
                type="button"
                onClick={onCancel}
                className={smallButton}
                aria-label={`Cancel ${bookingTitle(row)}`}
            >
                Cancel
            </button>
        ) : null;
    return (
        <AccountRow
            title={bookingTitle(row)}
            sub={bookingSub(row) || undefined}
            tag={<Tag tone="quiet">{bookingTag(row)}</Tag>}
            actions={
                move || cancel ? (
                    <>
                        {move}
                        {cancel}
                    </>
                ) : undefined
            }
        />
    );
}

function TreatmentCard({
    treatment,
    onBook,
}: {
    treatment: AccountTreatment;
    onBook: (visit: number) => void;
}) {
    const now = new Date();
    return (
        <AccountCard
            labelledBy={`treatment-${treatment.ref}`}
            title={treatment.name}
            sub={treatmentSub(treatment)}
            lead={treatmentLead(treatment) ?? undefined}
        >
            {treatment.visits.map((visit) => {
                const words = treatmentVisitWords(visit, treatment, now);
                return (
                    <AccountRow
                        key={visit.number}
                        title={words.title}
                        sub={words.sub || undefined}
                        tag={
                            <Tag tone={words.today ? "accent" : "quiet"}>
                                {words.tag}
                            </Tag>
                        }
                        actions={
                            treatment.bookNext === visit.number ? (
                                <button
                                    type="button"
                                    onClick={() => onBook(visit.number)}
                                    className={smallButton}
                                >
                                    Book visit {visit.number}
                                </button>
                            ) : undefined
                        }
                    />
                );
            })}
        </AccountCard>
    );
}
