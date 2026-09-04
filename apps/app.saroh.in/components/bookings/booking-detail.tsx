import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { CancelBookingControl } from "@/components/bookings/cancel-booking-control";
import { OutcomeControl } from "@/components/bookings/outcome-control";
import { RescheduleBooking } from "@/components/bookings/reschedule-booking";
import { formatDayLabel, formatTimeRange } from "@/lib/format/datetime";
import type { BookingDetail, BookingEvent } from "@/lib/services/service";

/**
 * One booking, and the two things a merchant is asked about it on the phone:
 * who is this, and can we move it (#121).
 *
 * Every time here is rendered in the BOOKING'S OWN timezone — the one the
 * booker saw — never the viewer's, for the same reason the calendar does it:
 * a merchant in Mumbai with a customer in London must read the customer's 9am
 * as the customer booked it. The zone is stated rather than implied, because
 * "9:00 AM" with no zone is a time nobody can act on.
 */
export function BookingDetailView({
    booking,
    past,
}: {
    booking: BookingDetail;
    /** Whether the slot has ended. Read by the page so "now" stays out of render. */
    past: boolean;
}) {
    const { service, contact, timezone } = booking;
    const cancelled = booking.status === "CANCELLED";
    // An archived service is retired from the menu, and its availability is
    // retired with it — the hours it still carries are hours the merchant has
    // stopped offering. Moving a booking into one would put a customer in a
    // slot the business no longer keeps, so the api refuses it and this does
    // not offer it. Cancelling stays, because winding the booking down is
    // exactly what a retired service's bookings need.
    const retired = service.status !== "ACTIVE";
    const moved = booking.events.filter((e) => e.type === "RESCHEDULED");
    // `find`, not `moved[0]`: indexing is typed as always-present here, and
    // this must actually be optional — most bookings have never been moved.
    const firstMove = booking.events.find((e) => e.type === "RESCHEDULED");

    return (
        <main className="mx-auto w-full max-w-4xl p-6 sm:p-8">
            <PageHeader
                title={service.name}
                description={`Booked by ${bookerLabel(booking)}.`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/bookings">All bookings</Link>
                        </Button>
                        {cancelled ? null : past ? (
                            // A past appointment cannot be moved and does not
                            // need cancelling — the only thing left to say
                            // about it is how it went.
                            <OutcomeControl
                                bookingId={booking.id}
                                outcome={booking.outcome}
                            />
                        ) : (
                            <>
                                {retired ? null : (
                                    <RescheduleBooking
                                        bookingId={booking.id}
                                        serviceId={service.id}
                                        timezone={timezone}
                                        currentStartAt={booking.startAt}
                                        currentEndAt={booking.endAt}
                                    />
                                )}
                                <CancelBookingControl bookingId={booking.id} />
                            </>
                        )}
                    </div>
                }
            />

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <section className="rounded-lg border border-border p-5">
                    <h2 className="text-sm font-medium">When</h2>
                    <p className="mt-2 text-lg font-medium tabular-nums">
                        {formatTimeRange(
                            booking.startAt,
                            booking.endAt,
                            timezone,
                        )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {formatDayLabel(booking.startAt, timezone)} · {timezone}
                    </p>
                    {/* The one fact a moved booking must not hide. Without it
                        a merchant looking at the current time has no way to
                        know the customer was ever told a different one. */}
                    {firstMove?.fromStartAt ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Moved from{" "}
                            <span className="text-foreground">
                                {shortTime(firstMove.fromStartAt, timezone)}
                            </span>
                            {moved.length > 1
                                ? ` · moved ${moved.length} times`
                                : ""}
                            .
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <StatusBadge status={booking.status} />
                        {booking.outcome ? (
                            <OutcomeBadge outcome={booking.outcome} />
                        ) : past && !cancelled ? (
                            // Said plainly rather than left blank: "nobody has
                            // said" is a real state, and the merchant is the
                            // only one who can end it.
                            <span className="text-sm text-muted-foreground">
                                Nobody has said how this went yet.
                            </span>
                        ) : null}
                    </div>
                    {retired && !cancelled && !past ? (
                        // A missing button with no explanation reads as a bug.
                        <p className="mt-3 text-sm text-muted-foreground">
                            {service.name} is archived, so this booking cannot
                            be moved. Make the service active again to
                            reschedule, or cancel the booking.
                        </p>
                    ) : null}
                </section>

                <section className="rounded-lg border border-border p-5">
                    <h2 className="text-sm font-medium">Who</h2>
                    <dl className="mt-2 grid gap-2 text-sm">
                        <Row label="Name" value={bookerLabel(booking)} />
                        <Row
                            label="Email"
                            value={contact?.email ?? booking.bookerEmail}
                        />
                        <Row
                            label="Phone"
                            value={contact?.phone ?? booking.bookerPhone}
                        />
                    </dl>
                    {/* A linked contact is a destination; a typed-in name is
                        not — the same rule the list row follows. */}
                    {contact ? (
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="mt-4"
                        >
                            <Link href={`/contacts/${contact.id}`}>
                                Open contact
                            </Link>
                        </Button>
                    ) : null}
                </section>
            </div>

            <section className="mt-6 rounded-lg border border-border p-5">
                <h2 className="text-sm font-medium">History</h2>
                <ol className="mt-3 grid gap-3">
                    {booking.events.map((event) => (
                        <li
                            key={event.id}
                            className="flex flex-wrap items-baseline gap-x-2 text-sm"
                        >
                            <span className="font-medium">
                                {eventTitle(event, timezone)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {formatDayLabel(event.createdAt, timezone)}
                                {/* Null actor means the booker did it through
                                    the public form — the difference between
                                    "they booked" and "we moved it". */}
                                {event.actor?.name
                                    ? ` · ${event.actor.name}`
                                    : " · by the customer"}
                            </span>
                        </li>
                    ))}
                    {booking.events.length === 0 ? (
                        <li className="text-sm text-muted-foreground">
                            This booking predates the history log, so only its
                            current state is known.
                        </li>
                    ) : null}
                </ol>
            </section>
        </main>
    );
}

function Row({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={value ? "" : "text-muted-foreground"}>
                {value ?? "Not given"}
            </dd>
        </div>
    );
}

function StatusBadge({ status }: { status: BookingDetail["status"] }) {
    return (
        <Badge
            className={cn(
                "text-[0.625rem] font-medium uppercase tracking-wider",
                status === "CONFIRMED"
                    ? "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground"
                    : status === "CANCELLED"
                      ? "border border-border bg-transparent text-muted-foreground"
                      : "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
            )}
        >
            {status}
        </Badge>
    );
}

function OutcomeBadge({ outcome }: { outcome: "ATTENDED" | "NO_SHOW" }) {
    return (
        <Badge
            className={cn(
                "text-[0.625rem] font-medium uppercase tracking-wider",
                outcome === "ATTENDED"
                    ? "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground"
                    : "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
            )}
        >
            {outcome === "ATTENDED" ? "Attended" : "No-show"}
        </Badge>
    );
}

/** One history line, in words rather than a state name. */
function eventTitle(event: BookingEvent, timeZone: string): string {
    if (event.type === "BOOKED") return "Booked";
    if (event.type === "CANCELLED") return "Cancelled";
    if (event.type === "ATTENDED") return "Marked as attended";
    if (event.type === "NO_SHOW") return "Marked as a no-show";
    const from = event.fromStartAt
        ? shortTime(event.fromStartAt, timeZone)
        : null;
    const to = event.toStartAt ? shortTime(event.toStartAt, timeZone) : null;
    return from && to ? `Moved from ${from} to ${to}` : "Moved";
}

/** "Mon, 20 Jul, 9:00 AM" — a whole instant, short enough for a history line. */
function shortTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(iso));
}

/** The contact's name if the CRM knows them, else whatever was typed in. */
function bookerLabel(booking: BookingDetail): string {
    const contact = booking.contact;
    if (contact) {
        const name = [contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        if (name) return name;
        return contact.email;
    }
    return booking.bookerName ?? booking.bookerEmail ?? "Unknown booker";
}
