import type { Prisma } from "@saroh/database";

/**
 * A service the booking page can offer a time for (UX-024): one with its
 * own weekly hours, or a one-to-one someone on the team takes, whose hours
 * then give its times. A class's times are always its own hours — the
 * instructor gives none — so a class with no hours of its own has nothing
 * to book. A service with neither stays off the booking page and the
 * website's services list until it has, rather than showing every day
 * closed; staff can still book it by hand.
 */
export const HAS_BOOKABLE_HOURS = {
    OR: [
        { availabilityRules: { some: {} } },
        {
            capacity: 1,
            staffServices: { some: { staff: { status: "ACTIVE" } } },
        },
    ],
} satisfies Prisma.ServiceWhereInput;

/** The same rule for a service already read, by its counts. */
export function hasBookableHours(service: {
    capacity: number;
    rules: number;
    activeStaff: number;
}): boolean {
    return (
        service.rules > 0 || (service.capacity === 1 && service.activeStaff > 0)
    );
}
