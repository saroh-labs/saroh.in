import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { formatDayHeading, formatTimeRange } from "@/lib/format/datetime";
import type { HomeBooking } from "@/lib/home/service";

/**
 * What is coming, on a time axis.
 *
 * A booking today and a booking in three weeks used to render identically — the
 * same card, the same date string, the same weight — which made the schedule a
 * list of facts rather than a plan for the day. Grouping by day and heading the
 * nearest ones "Today" / "Tomorrow" restores the only distinction that changes
 * behaviour.
 *
 * Each booking is grouped and labelled in ITS OWN timezone, never the viewer's.
 * The API deliberately does not fold them into one zone (an Organization has no
 * single zone), so a merchant in Mumbai sees a London customer's 9am slot as the
 * customer booked it.
 */
interface DayGroup {
    key: string;
    heading: string;
    bookings: HomeBooking[];
}

function groupByDay(bookings: HomeBooking[], now: Date): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const booking of bookings) {
        const heading = formatDayHeading(
            booking.startAt,
            booking.timezone,
            now,
        );
        const key = `${heading}|${booking.timezone}`;
        const last = groups.at(-1);
        if (last?.key === key) {
            last.bookings.push(booking);
        } else {
            groups.push({ key, heading, bookings: [booking] });
        }
    }
    return groups;
}

export function Schedule({
    bookings,
    now,
}: {
    bookings: HomeBooking[];
    now: Date;
}) {
    const groups = groupByDay(bookings, now);

    return (
        <section className="rounded-md border border-border bg-card">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    Coming up
                </h2>
                <Link
                    href="/bookings"
                    className="text-xs font-medium text-brand underline-offset-4 hover:underline"
                >
                    All bookings
                </Link>
            </header>

            {groups.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing booked yet. Reservations appear here as visitors
                    take slots on your services.
                </p>
            ) : (
                <div className="divide-y divide-border">
                    {groups.map((group) => (
                        <div key={group.key}>
                            <h3 className="bg-muted/40 px-4 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.heading}
                            </h3>
                            <ul className="divide-y divide-border">
                                {group.bookings.map((booking) => (
                                    <li
                                        key={booking.id}
                                        className="flex items-baseline gap-3 px-4 py-2.5"
                                    >
                                        {/* Time first and monospaced-by-figure:
                                            a column of aligned times is scanned
                                            as a timeline, a ragged one is not. */}
                                        <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                                            {formatTimeRange(
                                                booking.startAt,
                                                booking.endAt,
                                                booking.timezone,
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm">
                                                {booking.serviceName}
                                            </span>
                                            {booking.who ? (
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {booking.who}
                                                </span>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
