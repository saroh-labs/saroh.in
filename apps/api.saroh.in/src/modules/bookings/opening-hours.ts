import { BadRequestException } from "@nestjs/common";
import type { Prisma, Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import { publicWeek } from "../sites/public-visit.service";
import type {
    AvailabilityRuleWindow,
    Interval,
    OpeningHours,
} from "./availability";
import { isInsideOpening } from "./availability";
import type { BookingLocationType } from "./dto";
import { businessTimezone } from "./staff-availability";

/*
 * Opening hours for bookings (DEC-087, DEC-096): the hours set in Settings ›
 * Hours limit in-person bookings for every business — an in-person booking
 * is offered, and taken, only while it is open. Online bookings are not cut,
 * and a business with no hours saved books as it always did. The week is
 * read as the site's Visit us reads it (`public-visit.service.ts`): the
 * walk-in shops' weeks when the business has any, otherwise the business's
 * own week. The geometry is `availability.ts`; this is the reading, and who
 * it applies to.
 */

const DAY_OF_WEEK: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
};

/** "09:30" → 570. */
function minuteOf(clock: string): number {
    const [h = "0", m = "0"] = clock.split(":");
    return Number(h) * 60 + Number(m);
}

/**
 * A storefront's stored week (`StoreSettings.openingHours`, seven
 * `{ day, open, close, closed }` Monday first) as weekly windows, or null
 * when none is saved or it can't be read — checked as the site reads it,
 * so a malformed week never closes a business. A day closed, or one that
 * doesn't close after it opens, has no window.
 */
export function openingWindows(week: unknown): AvailabilityRuleWindow[] | null {
    const days = publicWeek(week);
    if (!days) return null;
    const windows: AvailabilityRuleWindow[] = [];
    for (const day of days) {
        if (day.closed) continue;
        const startMinute = minuteOf(day.open);
        const endMinute = minuteOf(day.close);
        if (endMinute <= startMinute) continue;
        windows.push({
            dayOfWeek: DAY_OF_WEEK[day.day],
            startMinute,
            endMinute,
        });
    }
    return windows;
}

/**
 * When the business is open, or null when it has no hours saved. With
 * walk-in storefronts, every shop's week counts — a time is open when any
 * of them is. Without one, the business's week: Settings › Hours writes the
 * same week to every storefront (DEC-034), so the first one says it, online
 * or not — the hours the site header shows (DEC-096).
 */
export async function loadOpeningHours(
    db: Pick<Prisma.TransactionClient, "store" | "businessProfile" | "service">,
    organizationId: string,
): Promise<OpeningHours | null> {
    const shops = await db.store.findMany({
        where: {
            organizationId,
            deletedAt: null,
            settings: { is: { kind: "SHOP" } },
        },
        select: { settings: { select: { openingHours: true } } },
    });
    const stored =
        shops.length > 0
            ? shops.map((shop) => shop.settings?.openingHours)
            : [
                  (
                      await db.store.findFirst({
                          where: { organizationId, deletedAt: null },
                          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                          select: {
                              settings: { select: { openingHours: true } },
                          },
                      })
                  )?.settings?.openingHours,
              ];
    const weeks = stored
        .map((week) => openingWindows(week))
        .filter((week) => week !== null);
    if (weeks.length === 0) return null;
    return {
        zone: await businessTimezone(db, organizationId),
        windows: weeks.flat(),
    };
}

/**
 * Whether a booking of `service` happens in person: as the service says,
 * or — offered either way — as the booker chose, in person when they
 * didn't (as `bookingLocation` stores it).
 */
export function happensInPerson(
    serviceLocation: string,
    asked: BookingLocationType | null | undefined,
): boolean {
    const where =
        serviceLocation === "EITHER" ? (asked ?? "IN_PERSON") : serviceLocation;
    return where === "IN_PERSON";
}

/** The opening hours a booking of `service` at `asked` keeps to, or null. */
export async function openingFor(
    service: Pick<Service, "organizationId" | "locationType">,
    asked: BookingLocationType | null | undefined,
): Promise<OpeningHours | null> {
    if (!happensInPerson(service.locationType, asked)) return null;
    return loadOpeningHours(prisma, service.organizationId);
}

/**
 * Refuse an in-person booking outside opening hours — by hand, moved, or
 * from the booking page. Opening hours are public, so the booker may hear
 * why; one still choosing Where (`orOnline`) is told it can be online.
 */
export function refuseOutsideOpening(
    opening: OpeningHours | null,
    booking: Interval,
    orOnline = false,
): void {
    if (isInsideOpening(booking, opening)) return;
    throw new BadRequestException({
        message: orOnline
            ? "In person, that time is outside opening hours. Pick another time, or choose online."
            : "That time is outside opening hours. Pick another time.",
        field: "startAt",
    });
}
