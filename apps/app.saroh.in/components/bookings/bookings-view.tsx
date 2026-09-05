"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { CancelBookingControl } from "@/components/bookings/cancel-booking-control";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import {
    daysUntil,
    formatDayHeading,
    formatTimeRange,
} from "@/lib/format/datetime";
// From ./booking-state, NOT ./service: this is a client component, and the
// service module reaches next/headers through the CRM HTTP plumbing.
import { hasEnded, needsOutcome } from "@/lib/services/booking-state";
import type { BookingWithService } from "@/lib/services/service";

/**
 * The schedule as a register.
 *
 * Bookings were a list of cards grouped by day, which read well and sorted
 * badly: there was no way to ask "which of these are unconfirmed" or "who books
 * the most" without scrolling the whole thing. A table sorts, filters and
 * compares; the day axis survives as the `when` column's heading line and as
 * the Today / This week filters, which is where it was actually doing work.
 *
 * Every time on this screen is rendered in the BOOKING'S OWN timezone — the one
 * the booker saw — not the viewer's. That is why `formatTimeRange` takes a zone
 * explicitly and why the zone travels on every row.
 */

const WITHIN_A_WEEK = 7;

const FILTERS: DataFilter<BookingWithService>[] = [
    // Upcoming leads, because the schedule is mostly read forwards. "Needs an
    // outcome" is the one that earns its place beside it: those appointments
    // are finished, invisible to every other view, and only a person can
    // resolve them (#241).
    { id: "upcoming", label: "Upcoming", predicate: (b) => !hasEnded(b) },
    {
        id: "outcome",
        label: "Needs an outcome",
        predicate: (b) => needsOutcome(b),
    },
    { id: "all", label: "All" },
    {
        id: "today",
        label: "Today",
        predicate: (b) =>
            formatDayHeading(b.startAt, b.timezone, new Date()) === "Today",
    },
    {
        id: "week",
        label: "Next 7 days",
        predicate: (b) => daysUntil(b.startAt) <= WITHIN_A_WEEK,
    },
    {
        id: "unconfirmed",
        label: "Unconfirmed",
        predicate: (b) => b.status !== "CONFIRMED",
    },
];

/**
 * Who the booking is for.
 *
 * The linked CRM contact wins over the name typed into the public form: the
 * contact is the record the business keeps, the typed name is whatever the
 * booker happened to enter. Email is the last resort before admitting we do not
 * know — and "Unknown booker" is only reached for a walk-in with no contact and
 * no details, which is a real state and not a rendering failure.
 */
function bookerLabel(booking: BookingWithService): string {
    const contact = booking.contact;
    if (contact) {
        const full = [contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        if (full) return full;
        if (contact.email) return contact.email;
    }
    const name = booking.bookerName?.trim();
    if (name) return name;
    const email = booking.bookerEmail?.trim();
    if (email) return email;
    return "Unknown booker";
}

export function BookingsView({
    bookings,
    initialView,
}: {
    bookings: BookingWithService[];
    initialView?: string;
}) {
    const now = new Date();

    const columns: DataColumn<BookingWithService>[] = [
        {
            id: "when",
            header: "When",
            priority: "primary",
            sortValue: (b) => new Date(b.startAt).getTime(),
            cell: (b) => (
                <span className="block whitespace-nowrap">
                    <span className="block text-xs text-muted-foreground">
                        {formatDayHeading(b.startAt, b.timezone, now)}
                    </span>
                    <span className="block font-medium tabular-nums">
                        {formatTimeRange(b.startAt, b.endAt, b.timezone)}
                    </span>
                </span>
            ),
        },
        {
            id: "service",
            header: "Service",
            priority: "secondary",
            sortValue: (b) => (b.service?.name ?? "").toLowerCase(),
            cell: (b) => b.service?.name ?? "Service",
        },
        {
            id: "booker",
            header: "Booked by",
            priority: "secondary",
            sortValue: (b) => bookerLabel(b).toLowerCase(),
            cell: (b) =>
                // A linked contact is a destination; a typed-in name is not.
                b.contact ? (
                    <Link
                        href={`/contacts/${b.contact.id}`}
                        className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                        {bookerLabel(b)}
                    </Link>
                ) : (
                    <span className="text-muted-foreground">
                        {bookerLabel(b)}
                    </span>
                ),
        },
        {
            id: "timezone",
            header: "Timezone",
            priority: "detail",
            sortValue: (b) => b.timezone,
            // Shown because the times above are NOT the viewer's: without the
            // zone stated, a merchant reading "9:00 AM" has no way to know
            // whose nine it is.
            cell: (b) => (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {b.timezone}
                </span>
            ),
        },
        {
            id: "outcome",
            header: "How it went",
            priority: "secondary",
            sortValue: (b) => b.outcome ?? "",
            // Only meaningful once an appointment is over, and deliberately
            // blank rather than "—" for a future one: there is nothing to
            // report yet, which is different from nobody having said.
            cell: (b) =>
                b.outcome ? (
                    <span
                        className={cn(
                            b.outcome === "NO_SHOW"
                                ? "text-warning-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {b.outcome === "ATTENDED" ? "Attended" : "No-show"}
                    </span>
                ) : needsOutcome(b) ? (
                    <span className="text-muted-foreground">Not said yet</span>
                ) : null,
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            sortValue: (b) => b.status,
            cell: (b) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        b.status === "CONFIRMED"
                            ? "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground"
                            : b.status === "CANCELLED"
                              ? "border border-border bg-transparent text-muted-foreground"
                              : "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
                    )}
                >
                    {b.status}
                </Badge>
            ),
        },
    ];

    return (
        <DataView
            viewId="bookings"
            rows={bookings}
            columns={columns}
            rowKey={(b) => b.id}
            // A row is a destination now (#121): the detail screen is where a
            // booking is moved, and where the two questions a merchant is
            // asked on the phone — who is this, can we move it — are answered.
            rowHref={(b) => `/bookings/${b.id}`}
            modes={["table", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView ?? "upcoming"}
            searchableColumnIds={["service", "booker"]}
            empty="Bookings appear here as visitors reserve slots on your services."
            rowActions={(b) =>
                // Not for an appointment that already happened: cancelling one
                // is meaningless, and the detail screen offers an outcome
                // instead (#241). A row must not offer what the screen behind
                // it refuses.
                b.status === "CONFIRMED" && !hasEnded(b) ? (
                    <CancelBookingControl bookingId={b.id} />
                ) : null
            }
        />
    );
}
