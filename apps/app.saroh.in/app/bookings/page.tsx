import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import { CancelBookingControl } from "@/components/bookings/cancel-booking-control";
import type { BookingWithService } from "@/lib/services/service";
import { listUpcomingBookings } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

/**
 * Owner bookings calendar (S4-003). The org's UPCOMING bookings across every
 * service, grouped by day and rendered in each booking's own timezone (the zone
 * the booker saw), each showing its service + booker + local time. A CONFIRMED
 * booking can be cancelled inline (freeing the slot). No calendar library — a
 * clean chronological list grouped by date is enough.
 */

/** The local "YYYY-MM-DD" key of an instant in a given IANA timezone. */
function localDateKey(iso: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(iso));
    return parts;
}

/** A friendly day heading (e.g. "Mon, 21 Jul 2026") in the booking's tz. */
function formatDayLabel(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(iso));
}

/** A local time range "9:00 – 9:30 AM" plus tz name, in the booking's tz. */
function formatTime(
    startISO: string,
    endISO: string,
    timeZone: string,
): string {
    const time = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
    return `${time.format(new Date(startISO))} – ${time.format(new Date(endISO))}`;
}

/** The booker's display name, falling back to their email. */
function bookerLabel(booking: BookingWithService): string {
    const name = booking.bookerName?.trim();
    if (name) return name;
    const email = booking.bookerEmail?.trim();
    if (email) return email;
    return "Unknown booker";
}

interface DayGroup {
    key: string;
    label: string;
    timeZone: string;
    bookings: BookingWithService[];
}

/** Group already-sorted bookings by their local calendar day. */
function groupByDay(bookings: BookingWithService[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const booking of bookings) {
        const timeZone = booking.timezone;
        const key = `${localDateKey(booking.startAt, timeZone)}|${timeZone}`;
        const last = groups.at(-1);
        if (last?.key === key) {
            last.bookings.push(booking);
        } else {
            groups.push({
                key,
                label: formatDayLabel(booking.startAt, timeZone),
                timeZone,
                bookings: [booking],
            });
        }
    }
    return groups;
}

export default async function BookingsPage() {
    await requireSession();

    const upcoming = await listUpcomingBookings();
    const groups = groupByDay(upcoming);

    return (
        <main className="mx-auto max-w-3xl p-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Bookings</h1>
                <div className="flex items-center gap-3">
                    <Button asChild variant="outline">
                        <Link href="/services">Services</Link>
                    </Button>
                    <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:underline"
                    >
                        ← Dashboard
                    </Link>
                </div>
            </div>

            {groups.length === 0 ? (
                <Card className="border-dashed">
                    <CardHeader className="items-center text-center">
                        <CardTitle>No upcoming bookings</CardTitle>
                        <CardDescription>
                            Bookings appear here as visitors reserve slots on
                            your services.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <div className="grid gap-8">
                    {groups.map((group) => (
                        <section key={group.key}>
                            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                                {group.label}
                            </h2>
                            <div className="grid gap-3">
                                {group.bookings.map((booking) => (
                                    <Card key={booking.id}>
                                        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                                            <div className="min-w-0">
                                                <CardTitle className="text-base">
                                                    {formatTime(
                                                        booking.startAt,
                                                        booking.endAt,
                                                        booking.timezone,
                                                    )}
                                                </CardTitle>
                                                <CardDescription className="truncate">
                                                    {booking.service?.name ??
                                                        "Service"}{" "}
                                                    · {bookerLabel(booking)}
                                                </CardDescription>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {booking.status ===
                                                "CONFIRMED" ? (
                                                    <CancelBookingControl
                                                        bookingId={booking.id}
                                                    />
                                                ) : (
                                                    <Badge variant="outline">
                                                        {booking.status}
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </main>
    );
}
