import type { StaffList } from "@/lib/staff/types";

import type { ServiceHours } from "./diary";
import type { AvailabilityRule, Service } from "./service";

/** The services whose own hours customers book with nobody on the diary. */
export function bookableOwnHours(services: readonly Service[]): Service[] {
    return services.filter(
        (s) => s.status === "ACTIVE" && s.capacity <= 1 && s.showOnBookingPage,
    );
}

/**
 * The services' own weekly hours together, with the business's closures as
 * time off (UX-023) — what the booking page offers while nobody is on the
 * diary. Null when none could be read or none has hours. Rules are kept in
 * each service's zone; a service's zone is the business's unless someone
 * changed it, and the diary draws in the business's.
 */
export function serviceHoursOf(
    rules: readonly (AvailabilityRule[] | null)[],
    closures: StaffList["closures"],
): ServiceHours | null {
    const hours = rules
        .flatMap((list) => list ?? [])
        .map(({ dayOfWeek, startMinute, endMinute }) => ({
            dayOfWeek,
            startMinute,
            endMinute,
        }));
    return hours.length > 0 ? { hours, timeOff: closures } : null;
}
