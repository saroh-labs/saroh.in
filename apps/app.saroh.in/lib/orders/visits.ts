import { formatMoment } from "@/lib/format/datetime";

import type { OrderVisit, OrderVisits, VisitState } from "./read";

/*
 * The words for a treatment's visits on Order Detail (B14, R16), after the
 * "Saroh Order Detail" design (`?id=D301`): the Visits card's rows, its
 * summary, the header's next action and the note beside it. Pure and
 * client-safe; the API decides what can happen next, this only says it.
 */

/** Whether an order is fulfilled by its visits (an appointment type). */
export function isAppointment(order: { fulfilmentType: string }): boolean {
    return (
        order.fulfilmentType === "APPOINTMENT_IN_PERSON" ||
        order.fulfilmentType === "APPOINTMENT_ONLINE"
    );
}

/** "1 of 3 attended". */
export function visitsSummary(
    v: Pick<OrderVisits, "attended" | "total">,
): string {
    return `${v.attended} of ${v.total} attended`;
}

/** The quick view's line: "1 of 3 visits". */
export function visitsCount(
    v: Pick<OrderVisits, "attended" | "total">,
): string {
    return `${v.attended} of ${v.total} visit${v.total === 1 ? "" : "s"}`;
}

/** The pill each state wears, and its word. */
export const VISIT_STATE: Record<
    VisitState,
    { label: string; tone: "success" | "brand" | "danger" | "neutral" }
> = {
    ATTENDED: { label: "Attended", tone: "success" },
    BOOKED: { label: "Booked", tone: "brand" },
    MISSED: { label: "Missed", tone: "danger" },
    TO_BOOK: { label: "Not booked", tone: "neutral" },
};

/** "In person" or "Video call". */
export function visitPlace(v: Pick<OrderVisit, "where">): string {
    return v.where === "ONLINE" ? "Video call" : "In person";
}

/** "Today, 10:00" · "18 Sep, 10:00", in the clinic's zone; "Not booked yet". */
export function visitWhen(
    v: Pick<OrderVisit, "startAt">,
    timeZone: string,
    now: Date,
): string {
    return v.startAt
        ? formatMoment(v.startAt, timeZone, now)
        : "Not booked yet";
}

/** "Dr. Meenakshi Rao · In person", or "Book it when Rahul is ready". */
export function visitMeta(
    v: Pick<OrderVisit, "startAt" | "staffName" | "where">,
    first: string,
): string {
    if (!v.startAt) return `Book it when ${first} is ready`;
    return [v.staffName, visitPlace(v)].filter(Boolean).join(" · ");
}

/**
 * The stepper's word for a visit: "Visit 2 · Today, 10:00", "Visit 1 ·
 * Yesterday", "Visit 3 · 19 Sep", or "Visit 3" before it is booked.
 */
export function visitStepLabel(
    v: Pick<OrderVisit, "number" | "startAt">,
    timeZone: string,
    now: Date,
): string {
    if (!v.startAt) return `Visit ${v.number}`;
    const moment = formatMoment(v.startAt, timeZone, now);
    const day = moment.startsWith("Today") ? moment : moment.split(",")[0];
    return `Visit ${v.number} · ${day}`;
}

/** A moment in a sentence: "today, 18:00", "yesterday, 10:00", "19 Sep, 18:00". */
function inSentence(at: string, timeZone: string, now: Date): string {
    return formatMoment(at, timeZone, now)
        .replace(/^Today/, "today")
        .replace(/^Yesterday/, "yesterday");
}

/** What the header's primary button says, or null when there is none. */
export function visitsNextLabel(v: OrderVisits): string | null {
    if (v.next.attend !== null) return `Mark visit ${v.next.attend} attended`;
    if (v.next.book !== null) return `Book visit ${v.next.book}`;
    return null;
}

/**
 * The note beside the header's action (the design's `nextNote`): what the
 * button does, or why there is none yet.
 */
export function visitsNextNote(
    v: OrderVisits,
    timeZone: string,
    now: Date,
): string | null {
    if (v.closed) return null;
    if (v.next.attend !== null) {
        return "Marks the visit done. After the last visit the order is complete.";
    }
    if (v.next.upcoming) {
        return `Next visit ${inSentence(v.next.upcoming.startAt, timeZone, now)}. You can mark it attended once it starts.`;
    }
    if (v.next.book !== null) return "Opens the diary to book the next visit.";
    return v.done ? "All visits are done." : null;
}

/** The heading's "how": "Booking, in person · next visit today, 18:00". */
export function visitsHow(
    label: string,
    v: OrderVisits | null | undefined,
    timeZone: string,
    now: Date,
): string {
    const next = v?.visits.find((x) => x.state === "BOOKED");
    return next?.startAt
        ? `${label} · next visit ${inSentence(next.startAt, timeZone, now)}`
        : label;
}

/** The status beside the number: Refunded, Attended (every visit) or Booked. */
export function visitsStanding(
    v: OrderVisits | null | undefined,
    refundedInFull: boolean,
    cancelled: boolean,
): { label: string; tone: "success" | "brand" | "neutral" } {
    if (cancelled) return { label: "Cancelled", tone: "neutral" };
    if (refundedInFull) return { label: "Refunded", tone: "neutral" };
    if (v?.done) return { label: "Attended", tone: "success" };
    return { label: "Booked", tone: "brand" };
}

/** A visit marked attended, as a line on the order's timeline. */
export function visitTimelineSteps(
    v: OrderVisits | null | undefined,
): { key: string; what: string; at: string; who: string | null }[] {
    if (!v) return [];
    return v.visits.flatMap((x) =>
        x.state === "ATTENDED" && x.attendedAt
            ? [
                  {
                      key: `visit-${x.number}`,
                      what: `Visit ${x.number} attended`,
                      at: x.attendedAt,
                      who: x.attendedBy?.name ?? null,
                  },
              ]
            : [],
    );
}

/**
 * The quick view's line (B5, B14): "1 of 3 visits · Visit 2 · booked 19 Sep",
 * "… · Visit 3 · to book", or the count alone once every visit is attended.
 */
export function quickVisitsText(
    v: OrderVisits,
    timeZone: string,
    now: Date,
): string {
    const count = visitsCount(v);
    const next = v.visits.find(
        (x) => x.state === "BOOKED" || x.state === "TO_BOOK",
    );
    if (!next || v.closed) return count;
    if (!next.startAt) return `${count} · Visit ${next.number} · to book`;
    const day = formatMoment(next.startAt, timeZone, now);
    const when = day.startsWith("Today") ? "today" : day.split(",")[0];
    return `${count} · Visit ${next.number} · booked ${when}`;
}

/**
 * "Change this order" on a treatment: its lines are fixed, a visit moves on
 * its booking, and money comes back through the order's refund (B9). In
 * person ⇄ online isn't offered here: B9 refuses a treatment's change of
 * how it's fulfilled.
 */
export const TREATMENT_CHANGE_NOTE =
    "The treatment is fixed once it's booked. Move a visit in the diary, or refund if it won't go ahead.";

/** What the toast says once a visit is marked. */
export function attendedToast(n: number, done: boolean): string {
    return `Visit ${n} marked attended.${done ? " All visits done." : ""}`;
}
