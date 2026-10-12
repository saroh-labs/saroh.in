/**
 * The words on Bookings › Services' rows (U16, E2; rows since the Bookings
 * audit of 12 Oct 2026): the count beside the heading, each row's one line
 * of length, where and kind, how it is booked, what is said once above the
 * list about services nobody takes, and the "Taking bookings" switch. Pure,
 * so the screen and its tests agree.
 */

import { joinFacts } from "@/lib/format/join";
import { count, plural } from "@/lib/format/plural";

import type { Service } from "./service";
import type { ServiceUsage } from "./usage";

type RowService = Pick<
    Service,
    | "status"
    | "showOnBookingPage"
    | "durationMinutes"
    | "bufferAfterMinutes"
    | "capacity"
    | "locationType"
> & {
    /** Visits one booking of it is (E10); absent reads as one. */
    visits?: number;
};

/**
 * Beside the heading: one count. "5 services", and how many the booking
 * page offers only when that differs ("5 services · 3 on the booking
 * page"), or that there is no booking page yet. Null `hasPage` is
 * "couldn't tell", which counts as usual. Nothing at zero: the header
 * leaves a count out then.
 */
export function servicesCount(
    services: readonly RowService[],
    hasPage: boolean | null,
): string | undefined {
    if (services.length === 0) return undefined;
    const all = count(services.length, "service");
    if (hasPage === false) return joinFacts(all, "no booking page yet");
    const onPage = services.filter(
        (s) => s.status === "ACTIVE" && s.showOnBookingPage,
    ).length;
    return onPage === services.length
        ? all
        : joinFacts(all, `${onPage} on the booking page`);
}

const WHERE: Record<Service["locationType"], string> = {
    IN_PERSON: "In person",
    ONLINE: "Online",
    EITHER: "In person or online",
};

/**
 * A row's one line: "60 min · 10 min gap after · In person · One-to-one";
 * a class "45 min · Online · Class · 12 places"; a treatment (E10)
 * "3 visits of 60 min · …". No gap is not said.
 */
export function lengthLine(service: RowService): string {
    const visits = service.visits ?? 1;
    const isClass = service.capacity > 1;
    return joinFacts(
        visits > 1
            ? `${visits} visits of ${service.durationMinutes} min`
            : `${service.durationMinutes} min`,
        service.bufferAfterMinutes
            ? `${service.bufferAfterMinutes} min gap after`
            : null,
        WHERE[service.locationType],
        isClass ? "Class" : "One-to-one",
        isClass ? `${service.capacity} places` : null,
    );
}

/**
 * How a row is booked: "3 booked this week · 5 still to come". Nothing
 * ("") when both are zero, which the row draws as the absent mark. A
 * paused service says it is off the booking page and what it kept; one
 * only staff book says so. Null `usage` is a failed bookings read, said as
 * such.
 */
export function bookedLine(
    service: RowService,
    usage: ServiceUsage | null | undefined,
): string {
    if (service.status !== "ACTIVE") {
        const n = usage?.comingUp ?? 0;
        return `Hidden from the booking page${
            n
                ? `. Its ${count(n, "booking")} still to come still ${plural(n, "happens", "happen")}`
                : ""
        }`;
    }
    const counted = !usage
        ? "Bookings couldn't be counted"
        : usage.thisWeek || usage.comingUp
          ? joinFacts(
                `${usage.thisWeek} booked this week`,
                `${usage.comingUp} still to come`,
            )
          : "";
    return service.showOnBookingPage
        ? counted
        : joinFacts("Staff only, not on the booking page", counted);
}

/**
 * Said once above the list, in place of a line on every row: which
 * services nobody takes, and what that means. With nobody on the diary at
 * all the way out is Availability ("It's just me", or the team); with
 * people on it, each service says who takes it on its own page. Null when
 * every service has someone.
 */
export function nobodyTakesLine(
    untaken: number,
    total: number,
    anyoneOnDiary: boolean,
): { line: string; toAvailability: boolean } | null {
    if (untaken <= 0) return null;
    if (!anyoneOnDiary) {
        return {
            line:
                total === 1
                    ? "Nobody takes bookings yet, so it books in its own hours."
                    : "Nobody takes bookings yet, so each service books in its own hours.",
            toAvailability: true,
        };
    }
    return {
        line:
            untaken === total && total > 1
                ? "Nobody takes these yet, so they book in their own hours. Open one to choose who takes it."
                : untaken === 1
                  ? "1 service has nobody to take it yet, so it books in its own hours. Open it to choose who takes it."
                  : `${count(untaken, "service")} have nobody to take them yet, so they book in their own hours. Open one to choose who takes it.`,
        toAvailability: false,
    };
}

/** Where someone goes on the diary: "It's just me", or the team. */
export const AVAILABILITY_HREF = "/bookings/availability";

/** The switch on a row and in the editor's header. */
export const TAKING_LABEL = "Taking bookings";

/** What flipping the switch says it did, with Undo beside it. */
export function takingToast(name: string, wasTaking: boolean): string {
    return wasTaking
        ? `${name} paused. It's off the booking page. Bookings already made still happen.`
        : `${name} is bookable again.`;
}
