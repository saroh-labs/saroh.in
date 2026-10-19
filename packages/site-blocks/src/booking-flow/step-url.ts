import { initialDateOf, initialTimeOf } from "./initial-start";

/**
 * The booking step in the address (site templates v2 U9, KD7): one route,
 * `/book?service=…&step=what|who|when|details|pay|done`, so Back walks the
 * steps, a reload stays on one, and a link opens on it.
 *
 * Only what is safe to share goes in the address: the service, the person
 * asked for, the day and time (in the business's zone), the booking being
 * moved and the booked one's reference. Never a note, a code, a phone, an
 * email, a name, or a hold's or payment's token: those stay in the page's
 * memory, and what is kept for a reload is in `booking-draft.ts`.
 *
 * Pure, so the rules are tested without the flow.
 */

export const BOOKING_STEPS = [
    "what",
    "who",
    "when",
    "details",
    "pay",
    "done",
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number];

/** What the address says, each field narrowed; anything else is null. */
export interface StepUrl {
    /** Null: the address names no step (a link from before steps). */
    step: BookingStep | null;
    service: string | null;
    /** The person asked for ("With: Asha"); null for anyone. */
    staff: string | null;
    /** `YYYY-MM-DD` in the business's zone. */
    date: string | null;
    /** `HH:MM` in the business's zone: with `date`, a time or a session. */
    start: string | null;
    /** A booking of theirs being moved (`MoveClass`). */
    move: string | null;
    /** The booked one's reference, on `done`. */
    ref: string | null;
}

export const EMPTY_STEP_URL: StepUrl = {
    step: null,
    service: null,
    staff: null,
    date: null,
    start: null,
    move: null,
    ref: null,
};

/** The keys this module owns, in the order they are written. */
const KEYS = [
    "service",
    "staff",
    "date",
    "start",
    "move",
    "ref",
    "step",
] as const satisfies readonly (keyof StepUrl)[];

/**
 * Names that must never ride in a booking address, even when a link
 * arrives with them: what a person typed, and the tokens that pay or hold.
 */
const NEVER = [
    "note",
    "intakeNote",
    "email",
    "phone",
    "bookerPhone",
    "name",
    "bookerName",
    "code",
    "token",
    "payToken",
    "hold",
    "holdToken",
];

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const idOf = (v: string | null): string | null =>
    v !== null && ID.test(v) ? v : null;

function stepOf(v: string | null): BookingStep | null {
    return BOOKING_STEPS.find((s) => s === v) ?? null;
}

/** The address's query read as a booking step and its choices. */
export function parseStepUrl(search: string): StepUrl {
    const q = new URLSearchParams(search);
    return {
        step: stepOf(q.get("step")),
        service: idOf(q.get("service")),
        staff: idOf(q.get("staff")),
        date: initialDateOf(q.get("date")),
        start: initialTimeOf(q.get("start")),
        move: idOf(q.get("move")),
        ref: idOf(q.get("ref")),
    };
}

/**
 * The query for `url`, on top of the address's own (`base`): what this
 * module owns is written from `url` alone, field by field, so nothing else
 * the flow holds can reach the address by passing a wider object. Other
 * parameters (a QR code's `src`, an ad's tags) are left as they were, and
 * any of the names that must never be there are taken off.
 */
export function serializeStepUrl(base: string, url: StepUrl): string {
    const q = new URLSearchParams(base);
    for (const key of KEYS) q.delete(key);
    for (const key of NEVER) q.delete(key);
    const safe = parseStepUrl(
        new URLSearchParams(
            KEYS.flatMap((key) => {
                const v = url[key];
                return typeof v === "string" ? [[key, v]] : [];
            }),
        ).toString(),
    );
    for (const key of KEYS) {
        const v = safe[key];
        if (v !== null) q.set(key, v);
    }
    const out = q.toString();
    return out ? `?${out}` : "";
}

/** What the page knows that the address can't say. */
export interface StepFacts {
    /** The address's service is one the page offers. */
    service: boolean;
    /** How many people take that service, by the page's own read. */
    people: number;
    /** A class, where no one is chosen: the session says who. */
    isClass: boolean;
    /** A pay-now hold is in the page's memory. */
    hold: boolean;
    /** A booking made on this page is in its memory. */
    finished: boolean;
}

/** The step a link to no step means: the furthest its choices reach. */
export function impliedStep(url: StepUrl): BookingStep {
    if (url.ref) return "done";
    if (!url.service) return "what";
    return url.date && url.start ? "details" : "when";
}

/** Whether a "Who" step is asked for this service: two people or more. */
export function asksWho(facts: Pick<StepFacts, "people" | "isClass">) {
    return !facts.isClass && facts.people > 1;
}

/**
 * The step to show for an address: the one it names, or the earliest
 * whose inputs are missing. A step the page can't stand on falls back:
 *
 * - `done` needs a booked reference, or a booking made on this page.
 * - Anything past `what` needs a service the page offers.
 * - `who` is only for a service with a choice of person.
 * - `details` needs a time.
 * - `pay` needs a hold in memory; a link or a reload has none, so the
 *   times are checked again (`when`).
 */
export function resolveStep(url: StepUrl, facts: StepFacts): BookingStep {
    const asked = url.step ?? impliedStep(url);
    if (asked === "done" && (url.ref || facts.finished)) return "done";
    if (!url.service || !facts.service) return "what";
    switch (asked) {
        case "what":
            return "what";
        case "who":
            return asksWho(facts) ? "who" : "when";
        case "details":
            return url.date && url.start ? "details" : "when";
        case "pay":
            return facts.hold && url.date && url.start ? "pay" : "when";
        default:
            return "when";
    }
}

/** Where a step sits in the order, for "forward" and "back". */
export function stepIndex(step: BookingStep): number {
    return BOOKING_STEPS.indexOf(step);
}

/**
 * Where closing the booking goes (U10's frames): the page the visitor came
 * from when it is on this site, else the site's home. Never another site,
 * and never back into `/book` itself.
 */
export function closeHref(referrer: string, origin: string): string {
    try {
        const from = new URL(referrer);
        if (from.origin !== origin) return "/";
        if (from.pathname === "/book" || from.pathname.startsWith("/book/")) {
            return "/";
        }
        return `${from.pathname}${from.search}${from.hash}`;
    } catch {
        return "/";
    }
}
