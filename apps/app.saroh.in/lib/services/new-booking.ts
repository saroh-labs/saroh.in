/**
 * New booking as a guided journey (U8, BKMNewBooking…Step6, BKDNewBooking):
 * one question a step, "Step 2 of 5", a sticky Next and a check card. The
 * rules of the steps are here, pure, so the phone layout, the desk panel
 * and their tests agree: which step comes next, what is missing, and the
 * words of the foot and the check card.
 */

import { formatDate, formatTime } from "@/lib/format/datetime";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, localDateOf } from "@/lib/services/diary";
import type { PickerSlot } from "@/lib/services/time-picker";

/** Who, What, With, When, Check and book. */
export type Step = 1 | 2 | 3 | 4 | 5;

/** Always five: a class skips With but still counts it (the boards). */
export const STEP_COUNT = 5;

/** The step's name, after "Step 2 of 5 · ". */
export const STEP_NAME: Record<Step, string> = {
    1: "Customer",
    2: "Service",
    3: "With",
    4: "Day and time",
    5: "Check and book",
};

/** The step's question, its heading. */
export const QUESTION: Record<Step, string> = {
    1: "Who is it for?",
    2: "What are they booking?",
    3: "Who will they see?",
    4: "When?",
    5: "Check and book",
};

/** The desk's step list: each step's key word (BKDNewBooking). */
export const RAIL_KEY: Record<Step, string> = {
    1: "Who",
    2: "What",
    3: "With",
    4: "When",
    5: "Pay and book",
};

export const PICK_WHO = "Pick who it's for, or add them.";
export const ADD_SERVICE = "Add a service first.";
export const PICK_SERVICE = "Pick a service.";
export const PICK_TIME = "Pick a time.";
export const PICK_DAY = "Pick a day.";

/** A service as New booking needs it. */
export interface FlowService {
    id: string;
    name: string;
    minutes: number;
    /** What a booking of it costs, GST and all; null for no price. */
    priceCents: number | null;
    currency: string | null;
    /** More than one: a group class, with its own times and places. */
    capacity: number;
    /** False: only customers book it, on the booking page (Q5). */
    bookableByTeam?: boolean;
}

/** Someone who takes bookings, as New booking needs them. */
export interface FlowPerson {
    id: string;
    name: string;
    /** "Physiotherapist", under their name on With. */
    title: string | null;
    serviceIds: readonly string[];
    /** The weekdays they work, 0 = Sunday; null when not known. */
    workDays: readonly number[] | null;
}

/** A group class: one teacher, its own times, places left. */
export function isClass(service: FlowService | null | undefined): boolean {
    return (service?.capacity ?? 1) > 1;
}

/** The people who do a service, in the order given. */
export function peopleFor(
    service: FlowService | null | undefined,
    people: readonly FlowPerson[],
): FlowPerson[] {
    if (!service) return [];
    return people.filter((p) => p.serviceIds.includes(service.id));
}

/**
 * Whether "Who will they see?" is asked (BKMNewBookingStep3): a
 * one-to-one more than one person does. A class's teacher comes with its
 * time; one person needs no choosing.
 */
export function asksWith(
    service: FlowService | null | undefined,
    people: readonly FlowPerson[],
): boolean {
    return !isClass(service) && peopleFor(service, people).length > 1;
}

/** The step after this one: With is skipped where it isn't asked. */
export function stepAfter(step: Step, asks: boolean): Step {
    if (step === 2 && !asks) return 4;
    return Math.min(step + 1, STEP_COUNT) as Step;
}

/** The step before this one, Back. */
export function stepBefore(step: Step, asks: boolean): Step {
    if (step === 4 && !asks) return 2;
    return Math.max(step - 1, 1) as Step;
}

/**
 * Where a way in starts (U8): at the first thing it doesn't know. The
 * customer's page knows who; Book their next visit knows who, what and
 * with whom, and starts at the day (Q16).
 */
export function firstStep(known: {
    who: boolean;
    service: boolean;
    withChosen: boolean;
    asks: boolean;
}): Step {
    if (!known.who) return 1;
    if (!known.service) return 2;
    if (known.asks && !known.withChosen) return 3;
    return 4;
}

/** What the flow holds, for what is missing. */
export interface FlowDraft {
    who: boolean;
    /** Services the team can book exist at all. */
    hasServices: boolean;
    serviceId: string | null;
    startAt: string | null;
    /** Book their next visit with no day picked yet (Q16). */
    noDay?: boolean;
}

/** What stops this step's Next, in the words its foot says; else null. */
export function stepProblem(step: Step, draft: FlowDraft): string | null {
    if (step === 1) return draft.who ? null : PICK_WHO;
    if (step === 2) {
        if (!draft.hasServices) return ADD_SERVICE;
        return draft.serviceId ? null : PICK_SERVICE;
    }
    if (step === 4 && !draft.startAt) return draft.noDay ? PICK_DAY : PICK_TIME;
    return null;
}

/**
 * The first thing missing before Book, and the step it is on
 * (BKMNewBookingStep5, "missing something").
 */
export function bookProblem(
    draft: FlowDraft,
): { step: Step; message: string } | null {
    for (const step of [1, 2, 4] as const) {
        const message = stepProblem(step, draft);
        if (message) return { step, message };
    }
    return null;
}

/** "Tue 20, 10:00 am": the Book button's when. */
export function bookWhen(startAt: string, timeZone: string): string {
    const day = formatDate(startAt, timeZone, { weekday: "short" });
    // "Tue 20 Oct" → "Tue 20".
    return `${day.split(" ").slice(0, 2).join(" ")}, ${formatTime(startAt, timeZone)}`;
}

/** "Tue 20 Oct, 10:00 am": the check card's When. */
export function whenWords(startAt: string, timeZone: string): string {
    return `${formatDate(startAt, timeZone, { weekday: "short" })}, ${formatTime(startAt, timeZone)}`;
}

/**
 * The sticky button: "Next: service" … "Book Kabir · Tue 20, 10:00 am",
 * and "Add and use" while a new customer's card is open.
 */
export function nextLabel(
    step: Step,
    input: { adding: boolean; asks: boolean; first: string; when: string },
): string {
    switch (step) {
        case 1:
            return input.adding ? "Add and use" : "Next: service";
        case 2:
            return input.asks ? "Next: who they'll see" : "Next: day and time";
        case 3:
            return "Next: day and time";
        case 4:
            return "Next: check and book";
        case 5:
            return [`Book ${input.first}`.trim(), input.when]
                .filter(Boolean)
                .join(" · ");
    }
}

/**
 * Who they'll see, as the check card and the step list say it: the
 * person, "Anyone free" until a time names them, then "Meera (anyone
 * free)", or a class's teacher.
 */
export function withWords(input: {
    chosen: { name: string } | null;
    /** Who the picked time is with, when the picker knows. */
    atTime: { name: string } | null;
    isClass: boolean;
    /** The only person who does it, when there is one. */
    only: { name: string } | null;
}): string {
    if (input.chosen) return input.chosen.name;
    if (input.isClass) {
        return input.atTime?.name ?? input.only?.name ?? "The class's teacher";
    }
    if (input.only) return input.only.name;
    if (input.atTime) return `${input.atTime.name} (anyone free)`;
    return "Anyone free";
}

/** "4 places left", "1 place left", "Full": under a class's time. */
export function placesNote(left: number | undefined): string | null {
    if (left === undefined) return null;
    if (left <= 0) return "Full";
    return `${left} ${left === 1 ? "place" : "places"} left`;
}

/**
 * Under a person on With: "next free today, 12:15 pm", "next free Tue 20
 * Oct, 9:00 am", or that there is nothing in the two weeks read.
 */
export function nextFreeWords(
    personId: string | null,
    slots: readonly PickerSlot[] | null,
    timeZone: string,
    now: number,
): string | null {
    if (slots === null) return null;
    const first = [...slots]
        .filter(
            (s) =>
                Date.parse(s.startAt) > now &&
                (personId === null || (s.staffIds ?? []).includes(personId)),
        )
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .at(0);
    if (!first) return "No free time in the next two weeks";
    const today = localDateOf(new Date(now), timeZone);
    const day = localDateOf(first.startAt, timeZone);
    const words =
        day === today
            ? "today"
            : day === addDays(today, 1)
              ? "tomorrow"
              : formatDate(first.startAt, timeZone, { weekday: "short" });
    return `next free ${words}, ${formatTime(first.startAt, timeZone)}`;
}

/**
 * Book their next visit's quick days (BKMNextVisit, Q16): tomorrow and a
 * week from today, as chips say them ("Tomorrow · Tue 20", "Next week ·
 * Mon 26").
 */
export function nextVisitDays(
    today: LocalDate,
    timeZone: string,
): { key: "tomorrow" | "week"; date: LocalDate; label: string }[] {
    const short = (date: LocalDate) =>
        formatDate(date, timeZone, { weekday: "short" })
            .split(" ")
            .slice(0, 2)
            .join(" ");
    const tomorrow = addDays(today, 1);
    const week = addDays(today, 7);
    return [
        {
            key: "tomorrow",
            date: tomorrow,
            label: `Tomorrow · ${short(tomorrow)}`,
        },
        { key: "week", date: week, label: `Next week · ${short(week)}` },
    ];
}

/**
 * The days nobody who does the service works, 0 = Sunday, for the day
 * strip's "Closed": each person's working weekdays. Nobody known closes
 * nothing (a service nobody takes keeps its own hours).
 */
export function closedWeekdaysOf(
    workDays: readonly (readonly number[])[],
): number[] {
    if (workDays.length === 0) return [];
    const open = new Set(workDays.flat());
    return [0, 1, 2, 3, 4, 5, 6].filter((d) => !open.has(d));
}
