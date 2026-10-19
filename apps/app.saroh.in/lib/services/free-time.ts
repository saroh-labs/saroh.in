import {
    formatClock,
    formatClockRange,
    formatDay,
} from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { LocalDate, Span } from "@/lib/services/diary";
import type { Service } from "@/lib/services/service";
import type { ExtraHours, StaffView } from "@/lib/staff/types";

/**
 * The free-time sheet's words and rules (U9, BKMNewFromGap, BKDFromGap),
 * pure so the sheet and its tests share them. A free time is a person, a
 * day and a span of minutes from midnight, already known when the sheet
 * opens: it asks only the service, who it is for and how they pay, or
 * blocks the time instead.
 */

/** The sheet's three steps, in order. */
export type GapStep = 1 | 2 | 3;

/** "Step 1 of 3 · Pick a service". */
export const GAP_STEP_NAME: Record<GapStep, string> = {
    1: "Pick a service",
    2: "Who is it for?",
    3: "Check and book",
};

/** The foot's button on each step before the last. */
export const GAP_NEXT: Record<1 | 2, string> = {
    1: "Next: who it’s for",
    2: "Next: check and book",
};

/** What stops the step moving on. */
export const PICK_A_SERVICE = "Pick a service.";
export const PICK_WHO = "Pick who it’s for, or add them.";

/** "30 min", "1 hour", "3 hours", "90 min". */
export function lengthWords(minutes: number): string {
    if (minutes % 60) return `${minutes} min`;
    return count(minutes / 60, "hour");
}

/** "today", "tomorrow", or "Tue 20 Oct", mid-sentence. */
export function gapDay(date: LocalDate, today: LocalDate): string {
    return formatDay(date, {
        weekday: "short",
        year: "never",
        relative: "lower",
        today,
    });
}

/** The same at the start of a line: "Today", "Tue 20 Oct". */
export function gapDayTitle(date: LocalDate, today: LocalDate): string {
    const day = gapDay(date, today);
    return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * The one-off extra opening hours this free time sits in, if any: the
 * only case that offers "Close these extra hours" (Q11).
 */
export function extraHoursAt(
    staff: Pick<StaffView, "extraHours">,
    date: LocalDate,
    minute: number,
): ExtraHours | null {
    return (
        staff.extraHours.find(
            (x) =>
                x.date.slice(0, 10) === date &&
                minute >= x.startMinute &&
                minute < x.endMinute,
        ) ?? null
    );
}

/** "Free until 5:00 pm · 1 hour", ", in extra hours" when it is. */
export function freeLine(free: Span, extra: boolean): string {
    const room = lengthWords(free[1] - free[0]);
    return `Free until ${formatClock(free[1])} · ${room}${extra ? ", in extra hours" : ""}`;
}

/** The one-to-one services this person does, as the sheet lists them. */
export function servicesFor(
    services: readonly Service[],
    staff: Pick<StaffView, "serviceIds">,
): Service[] {
    return services.filter(
        (s) =>
            s.status === "ACTIVE" &&
            s.capacity <= 1 &&
            staff.serviceIds.includes(s.id),
    );
}

/** A service in this free time: can it be picked, and what its row says. */
export interface ServiceFit {
    /** Where it starts; null when it can't be booked here. */
    at: number | null;
    /** "45 min · fits, ends 4:45 pm", "90 min · too long for this 60 min gap". */
    note: string;
    /** Why it is greyed, said in red on the desk (BKDFromGap). */
    off: boolean;
}

/**
 * What a service's row says (BKMNewFromGap): it fits and when it ends;
 * it fits from a later time (its own hours start later in the gap); it is
 * too long for the gap; it can't start here (outside its own hours or its
 * rules); or only customers book it (Q5: "Your team" isn't ticked). Until
 * the starts are read, `start` is undefined and the row just says its
 * length.
 */
export function serviceFit(
    service: Pick<Service, "durationMinutes" | "bookableByTeam">,
    free: Span,
    start: number | null | undefined,
): ServiceFit {
    const minutes = service.durationMinutes;
    const room = free[1] - free[0];
    if (service.bookableByTeam === false) {
        return {
            at: null,
            note: `${minutes} min · only customers book it, on your booking page`,
            off: true,
        };
    }
    if (minutes > room) {
        return {
            at: null,
            note: `${minutes} min · too long for this ${room} min gap`,
            off: true,
        };
    }
    if (start === undefined) {
        return { at: null, note: `${minutes} min`, off: false };
    }
    if (start === null) {
        return {
            at: null,
            note: `${minutes} min · can’t start in this free time`,
            off: true,
        };
    }
    const ends = formatClock(start + minutes);
    return {
        at: start,
        note:
            start === free[0]
                ? `${minutes} min · fits, ends ${ends}`
                : `${minutes} min · fits from ${formatClock(start)}, ends ${ends}`,
        off: false,
    };
}

/**
 * How long a block can be, from the gap's start: the whole gap first,
 * then two hours, an hour and half an hour where they are shorter.
 */
export function blockLengths(room: number): number[] {
    return [room, ...[120, 60, 30].filter((m) => m < room)];
}

/** A length's chip: "The whole gap · 1 hour", "30 min". */
export function blockLengthLabel(minutes: number, whole: boolean): string {
    return whole
        ? `The whole gap · ${lengthWords(minutes)}`
        : lengthWords(minutes);
}

/** "4:00 to 5:00 pm". */
export function blockRange(from: number, minutes: number): string {
    return formatClockRange(from, Math.min(from + minutes, 1440));
}
