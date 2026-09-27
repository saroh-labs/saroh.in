/**
 * How each service is being used, from one bookings read (U16, E2): places
 * and bookings held this week, and what is still to come. Pure, so the
 * Services cards and the Service Editor's "At a glance" count the same way.
 */

import type { BookingsCalendar } from "./booking-calendar";

export interface ServiceUsage {
    /** Places or bookings this week, cancelled ones left out. */
    thisWeek: number;
    /** Bookings (or class starts) still to come. */
    comingUp: number;
}

/**
 * Tally a calendar read that starts at the week's start. This week counts
 * everything before `weekEnd`; still to come counts bookings, and a class's
 * starts with someone on them, from `now`. Every service asked about gets a
 * row, zero when nothing is booked.
 */
export function tallyUsage(
    calendar: BookingsCalendar,
    serviceIds: readonly string[],
    { now, weekEnd }: { now: number; weekEnd: number },
): Record<string, ServiceUsage> {
    const tally: Record<string, ServiceUsage> = {};
    const of = (id: string) => (tally[id] ??= { thisWeek: 0, comingUp: 0 });
    for (const diary of calendar.diaries) {
        for (const b of diary.bookings) {
            if (b.status === "CANCELLED") continue;
            const at = Date.parse(b.startAt);
            if (at < weekEnd) of(b.serviceId).thisWeek += 1;
            if (at >= now) of(b.serviceId).comingUp += 1;
        }
        for (const s of diary.classes) {
            const held = s.bookings.filter(
                (b) => b.status !== "CANCELLED",
            ).length;
            if (!held) continue;
            const at = Date.parse(s.startAt);
            if (at < weekEnd) of(s.service.id).thisWeek += held;
            if (at >= now) of(s.service.id).comingUp += 1;
        }
    }
    return Object.fromEntries(
        serviceIds.map((id) => [id, tally[id] ?? { thisWeek: 0, comingUp: 0 }]),
    );
}
