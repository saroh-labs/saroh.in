import type { Prisma } from "@saroh/database";
import { IANAZone } from "luxon";

import type { Interval, StaffAvailabilityInput } from "./availability";
import { holdsPlace } from "./booking-hold";

/**
 * Reading people's hours for the slot engine (U3). The geometry is pure and
 * lives in `availability.ts`; this is only the loading.
 */

type Db = Pick<
    Prisma.TransactionClient,
    | "businessProfile"
    | "service"
    | "staffService"
    | "staffHours"
    | "staffExtraHours"
    | "staffTimeOff"
    | "booking"
>;

/** Where no business has said otherwise (the product is India-first). */
export const FALLBACK_TIMEZONE = "Asia/Kolkata";

const DAY = 86_400_000;

/** Where a business's zone came from — the calendars say which they used. */
export type ZoneSource = "business" | "service" | "fallback";

/**
 * The zone a business keeps its hours in: its own setting, else the zone of
 * its first active service, else India. Staff hours are wall-clock times in
 * this zone, and the calendars (U4) bucket days in it.
 */
export async function businessZone(
    db: Pick<Db, "businessProfile" | "service">,
    organizationId: string,
): Promise<{ zone: string; source: ZoneSource }> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { timezone: true },
    });
    if (profile?.timezone && IANAZone.isValidZone(profile.timezone)) {
        return { zone: profile.timezone, source: "business" };
    }
    const first = await db.service.findFirst({
        where: { organizationId, deletedAt: null, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { timezone: true },
    });
    if (first?.timezone && IANAZone.isValidZone(first.timezone)) {
        return { zone: first.timezone, source: "service" };
    }
    return { zone: FALLBACK_TIMEZONE, source: "fallback" };
}

/** {@link businessZone}, the zone alone. */
export async function businessTimezone(
    db: Pick<Db, "businessProfile" | "service">,
    organizationId: string,
): Promise<string> {
    return (await businessZone(db, organizationId)).zone;
}

/** Who takes a service: active people only, in a stable order. */
export async function serviceStaff(
    db: Db,
    serviceId: string,
): Promise<{ id: string; name: string }[]> {
    const rows = await db.staffService.findMany({
        where: { serviceId, staff: { status: "ACTIVE" } },
        select: { staff: { select: { id: true, name: true } } },
    });
    return rows
        .map((r) => r.staff)
        .sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        );
}

/** A `@db.Date` as the calendar date it stores. */
export function dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/**
 * Everything the engine needs for these people over `[from, to)` — padded a
 * day either side, like the engine's own windows. `excludeBookingId` leaves
 * out a booking being moved, so it does not collide with itself.
 */
export async function loadPeople(
    db: Db,
    staffIds: string[],
    from: Date,
    to: Date,
    excludeBookingId?: string,
): Promise<StaffAvailabilityInput[]> {
    if (staffIds.length === 0) return [];
    const padFrom = new Date(from.getTime() - 2 * DAY);
    const padTo = new Date(to.getTime() + 2 * DAY);
    const [hours, extra, off, busy] = await Promise.all([
        db.staffHours.findMany({
            where: { staffId: { in: staffIds } },
            select: {
                staffId: true,
                dayOfWeek: true,
                startMinute: true,
                endMinute: true,
            },
        }),
        db.staffExtraHours.findMany({
            where: {
                staffId: { in: staffIds },
                date: { gte: padFrom, lte: padTo },
            },
            select: {
                staffId: true,
                date: true,
                startMinute: true,
                endMinute: true,
            },
        }),
        db.staffTimeOff.findMany({
            where: {
                staffId: { in: staffIds },
                startAt: { lt: padTo },
                endAt: { gt: padFrom },
            },
            select: { staffId: true, startAt: true, endAt: true },
        }),
        db.booking.findMany({
            where: {
                staffId: { in: staffIds },
                ...holdsPlace(new Date()),
                startAt: { lt: padTo },
                endAt: { gt: padFrom },
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            },
            select: { staffId: true, startAt: true, endAt: true },
        }),
    ]);
    const pick = <T extends { staffId: string | null }>(
        rows: T[],
        id: string,
    ) => rows.filter((r) => r.staffId === id);
    const interval = (r: { startAt: Date; endAt: Date }): Interval => ({
        startAt: r.startAt,
        endAt: r.endAt,
    });
    return staffIds.map((id) => ({
        id,
        hours: pick(hours, id).map(({ dayOfWeek, startMinute, endMinute }) => ({
            dayOfWeek,
            startMinute,
            endMinute,
        })),
        extraHours: pick(extra, id).map((r) => ({
            date: dateOnly(r.date),
            startMinute: r.startMinute,
            endMinute: r.endMinute,
        })),
        timeOff: pick(off, id).map(interval),
        busy: pick(busy, id).map(interval),
    }));
}
