/**
 * The words on Bookings › Services' cards (U16, E2, after the Bookings
 * design): the summary beside the heading, each card's length line and
 * usage line, and the Stop / Take bookings again switch. Pure, so the
 * screen and its tests agree.
 */

import type { Service } from "./service";
import type { ServiceUsage } from "./usage";

type CardService = Pick<
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
 * Beside the heading: how many the booking page offers and how many are
 * paused — or that there is no booking page yet. Null `hasPage` is "couldn't
 * tell", which counts as usual.
 */
export function servicesSummary(
    services: readonly CardService[],
    hasPage: boolean | null,
): string {
    const paused = services.filter((s) => s.status !== "ACTIVE").length;
    const onPage = services.filter(
        (s) => s.status === "ACTIVE" && s.showOnBookingPage,
    ).length;
    const head =
        hasPage === false
            ? "No booking page yet"
            : `${onPage} on the booking page`;
    return paused ? `${head} · ${paused} paused` : head;
}

/**
 * "60 min · 15 min gap after · Online · 12 places"; a treatment (E10)
 * "3 visits of 60 min · …".
 */
export function lengthLine(service: CardService): string {
    const visits = service.visits ?? 1;
    const parts = [
        visits > 1
            ? `${visits} visits of ${service.durationMinutes} min`
            : `${service.durationMinutes} min`,
        service.bufferAfterMinutes
            ? `${service.bufferAfterMinutes} min gap after`
            : "no gap after",
    ];
    if (service.locationType === "ONLINE") parts.push("Online");
    if (service.locationType === "EITHER") parts.push("In person or online");
    if (service.capacity > 1) parts.push(`${service.capacity} places`);
    return parts.join(" · ");
}

/**
 * Under the rule: how it is being used, or what pausing it kept. Null
 * `usage` is a failed bookings read, said as such.
 */
export function usageLine(
    service: CardService,
    usage: ServiceUsage | null | undefined,
): string {
    if (service.status !== "ACTIVE") {
        const n = usage?.comingUp ?? 0;
        return `Paused — hidden from the booking page${
            n
                ? `; ${n === 1 ? "its 1 booking still to come still happens" : `its ${n} bookings still to come still happen`}`
                : ""
        }`;
    }
    const counted = usage
        ? `${usage.thisWeek} booked this week · ${usage.comingUp} still to come`
        : "Bookings couldn't be counted";
    return service.showOnBookingPage
        ? counted
        : `Staff only — not on the booking page · ${counted}`;
}

/** The switch on a card and in the editor's header. */
export function takingLabel(taking: boolean): string {
    return taking ? "Stop taking bookings" : "Take bookings again";
}

/** What the card's switch says it did, with Undo beside it. */
export function takingToast(name: string, wasTaking: boolean): string {
    return wasTaking
        ? `${name} paused. It's off the booking page; bookings already made still happen.`
        : `${name} is bookable again.`;
}
