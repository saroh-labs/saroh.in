/**
 * New and edit service (U16, #1032; boards BKMServiceNew,
 * BKMServiceNewStep2, BKMServiceEdit and BKDServiceNew): the words around
 * the five questions, the live "can customers book it" line, "Who can
 * book it" (DEC-170, Q5: two ticks, any of the four mixes, neither is
 * paused), the More details rows, the edit page's group cards and which
 * fields each side panel holds. Pure and client-safe, so the screens and
 * their tests agree. The draft, its problems and what Save sends are
 * `service-editor.ts`'s.
 */

import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { WhoCanBook, WhoFields } from "./service-cards";
import { pauseToast } from "./service-cards";
import type {
    ServiceDraft,
    ServiceField,
    ServiceKind,
    ServiceProblem,
} from "./service-editor";
import { hasBookableHours, toMinor } from "./service-editor";

/** "a, b, and c": the board's own list, with the comma before "and". */
export function listWords(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

// ---------------------------------------------------------------------
// Who can book it (DEC-170, Q5)
// ---------------------------------------------------------------------

export const WHO_CAN_BOOK = "Who can book it";

/** The two ticks: customers on the booking page, the team from Bookings. */
export interface Bookers {
    customers: boolean;
    team: boolean;
}

/** The ticks a saved service shows: none for one paused the old way. */
export function bookersOf(s: WhoFields): Bookers {
    if (s.status !== "ACTIVE") return { customers: false, team: false };
    return { customers: s.showOnBookingPage, team: s.bookableByTeam };
}

/** The mix the ticks make; neither is paused. */
export function mixOf(b: Bookers): WhoCanBook {
    if (b.customers && b.team) return "both";
    if (b.customers) return "customers";
    if (b.team) return "team";
    return "paused";
}

/**
 * What ticking writes. A tick on takes a service paused the old way (its
 * status) off pause too; unticking both leaves the status as it is.
 */
export function bookersPatch(b: Bookers): Partial<WhoFields> {
    return b.customers || b.team
        ? {
              status: "ACTIVE",
              showOnBookingPage: b.customers,
              bookableByTeam: b.team,
          }
        : { showOnBookingPage: false, bookableByTeam: false };
}

/** Each tick's words. Customers pick in whose free time it is booked. */
export function bookerWords(
    which: keyof Bookers,
    freeTime: string | null = null,
): { label: string; sub: string } {
    return which === "customers"
        ? {
              label: "Customers, on your booking page",
              sub: freeTime
                  ? `They pick a time in ${freeTime}`
                  : "They pick a time in the free hours",
          }
        : {
              label: "Your team, from Bookings",
              sub: "Anyone who books for the business",
          };
}

/** Said under the ticks with neither ticked, and on the delete confirm. */
export const PAUSE_LINE =
    "Untick both to pause it. Bookings already made stay.";

/**
 * The line under the ticks on a saved service: who books it how, and
 * what is still to come. Null `comingUp` is a count that failed.
 */
export function takingLine(b: Bookers, comingUp: number | null): string {
    const mix = mixOf(b);
    if (mix === "paused") return PAUSE_LINE;
    const first =
        mix === "both"
            ? "Customers book it on your booking page, and your team books it from Bookings."
            : mix === "customers"
              ? "Your team can't book it from Bookings."
              : "It's not on your booking page.";
    return comingUp ? `${first} ${count(comingUp, "booking")} to come.` : first;
}

/** What a tick says it did, with Undo beside it. */
export function bookersToast(name: string, b: Bookers): string {
    const mix = mixOf(b);
    if (mix === "both") return `${name}: customers and your team can book it.`;
    if (mix === "customers") {
        return `${name}: only customers can book it now, on your booking page.`;
    }
    if (mix === "team") {
        return `${name}: only your team can book it now, from Bookings.`;
    }
    return pauseToast(name, false);
}

/**
 * The toast once a new service is added: `usual` (`savedMessage`) while
 * customers can book it; otherwise who can, or that it was added paused.
 */
export function addedMessage(name: string, b: Bookers, usual: string): string {
    const mix = mixOf(b);
    if (mix === "team") {
        return `${name} added. Only your team can book it, from Bookings.`;
    }
    if (mix === "paused") {
        return `${name} added, paused. Tick who can book it when you're ready.`;
    }
    return usual;
}

/** More's way to pause, or to take bookings again. */
export function pauseLabel(b: Bookers): string {
    return mixOf(b) === "paused"
        ? "Start taking bookings again"
        : "Pause: untick both, nobody can book it";
}

// ---------------------------------------------------------------------
// The live line (new service)
// ---------------------------------------------------------------------

/**
 * Whose free time a one-to-one fills: "Meera's free time", "Meera's and
 * Arjun's free time"; a class, or one nobody does, books in its own
 * weekly hours.
 */
export function freeTimeOf(
    kind: ServiceKind,
    names: readonly string[],
): string {
    const [a, b] = names;
    if (kind === "class" || !a) return "its own weekly hours";
    if (names.length === 1) return `${a}'s free time`;
    if (names.length === 2 && b) return `${a}'s and ${b}'s free time`;
    return `the free time of the ${names.length} people who do it`;
}

export interface LiveInput {
    draft: Pick<
        ServiceDraft,
        | "name"
        | "price"
        | "kind"
        | "staffIds"
        | "hours"
        | "showOnBookingPage"
        | "bookableByTeam"
    >;
    /** Who does it has to be picked: there is a choice of people. */
    staffNeeded: boolean;
    /** The call names of who does it, in order. */
    names: readonly string[];
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
}

/**
 * Whether customers could book it as soon as it is added, worked out from
 * the same rules the page saves by: a name and a price, someone to do it
 * (when there is a choice), times to offer, and who may book it.
 */
export function liveLine({ draft, staffNeeded, names, hasPage }: LiveInput): {
    ready: boolean;
    text: string;
} {
    const missing: string[] = [];
    const price = toMinor(draft.price);
    const wants = [
        draft.name.trim() ? null : "a name",
        price === null || Number.isNaN(price) ? "a price" : null,
    ].filter((x): x is string => x !== null);
    if (wants.length) missing.push(`add ${listWords(wants)}`);
    if (staffNeeded && draft.staffIds.length === 0) {
        missing.push("pick who does it");
    }
    if (
        !hasBookableHours(
            draft.kind,
            draft.hours.length,
            draft.staffIds.length,
        ) &&
        !(staffNeeded && draft.staffIds.length === 0)
    ) {
        missing.push(
            draft.kind === "class"
                ? "give it weekly times"
                : "give it weekly hours",
        );
    }
    if (missing.length) {
        return {
            ready: false,
            text: `Not bookable yet: ${missing.join(", then ")}.`,
        };
    }
    const b = {
        customers: draft.showOnBookingPage,
        team: draft.bookableByTeam,
    };
    const mix = mixOf(b);
    if (mix === "paused") {
        return {
            ready: true,
            text: "Paused: nobody can book it until you tick who can.",
        };
    }
    if (mix === "team") {
        return {
            ready: true,
            text: "Only your team can book this, from Bookings. It's not on your booking page.",
        };
    }
    if (hasPage === false) {
        return {
            ready: true,
            text:
                mix === "both"
                    ? "Your team can book this from Bookings. Customers can once your booking page is live."
                    : "Customers can book this once your booking page is live. Your team can't book it from Bookings.",
        };
    }
    const where = freeTimeOf(draft.kind, names);
    return {
        ready: true,
        text: `Customers can book this on your booking page, in ${where}, as soon as you add it.${
            mix === "both" ? "" : " Your team can't book it from Bookings."
        }`,
    };
}

/** Under More details' title: whether it is bookable as it stands. */
export function detailsLine(b: Bookers): string {
    return mixOf(b) === "paused"
        ? "Paused: tick who can book it, or add it paused."
        : "Bookable as soon as you add it.";
}

// ---------------------------------------------------------------------
// Pressing Add with gaps
// ---------------------------------------------------------------------

/** Each field as the headline lists it. */
const GAP_WORDS: Record<ServiceField, string> = {
    name: "a name",
    price: "a price (0 if it's free)",
    staffIds: "who does it",
    minutes: "how long it takes",
    places: "how many places",
    gap: "the break after",
    bufferBefore: "the break before",
    visits: "the visits in a package",
    meetingUrl: "the link to join",
    gstRate: "its GST rate",
    sacCode: "its SAC code",
    timezone: "a time zone",
    hours: "its own hours",
};

/**
 * Said over the form when Add is pressed with gaps: "3 things to fill in
 * before it can be added: a name, a price (0 if it's free), and who does
 * it." Each is said again at its field.
 */
export function gapsLine(problems: readonly ServiceProblem[]): string {
    const fields = Array.from(new Set(problems.map((p) => p.field)));
    return `${count(fields.length, "thing")} to fill in before it can be added: ${listWords(
        fields.map((f) => GAP_WORDS[f]),
    )}.`;
}

// ---------------------------------------------------------------------
// The summary in the sticky foot, and a name already taken
// ---------------------------------------------------------------------

/** "One person · 45 min · ₹1,200 · Meera" in the sticky foot. */
export function summaryLine(
    draft: Pick<ServiceDraft, "kind" | "places" | "minutes" | "price">,
    names: readonly string[],
    currency: string,
): string {
    const price = toMinor(draft.price);
    const priceText =
        price === null || Number.isNaN(price)
            ? "no price yet"
            : price === 0
              ? "Free"
              : formatMoney(price, currency);
    const who =
        draft.kind === "class"
            ? `Group class of ${draft.places.trim() || "?"}`
            : "One person";
    return [
        who,
        `${draft.minutes.trim() || "?"} min`,
        priceText,
        names.length ? names.join(", ") : "nobody yet",
    ].join(" · ");
}

/** Another service already called this, by its name as typed. */
export function sameNameAs<T extends { id: string; name: string }>(
    name: string,
    others: readonly T[],
    selfId: string | null = null,
): T | null {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    return (
        others.find(
            (s) => s.id !== selfId && s.name.trim().toLowerCase() === key,
        ) ?? null
    );
}

/** What a name already taken says, with "Open it" after it. */
export function sameNameLine(name: string): string {
    return `You already have ${name}.`;
}

/**
 * The draft's problems, and a name another service already has as the
 * name's, ahead of the rest (it is the first field).
 */
export function withSameName(
    problems: readonly ServiceProblem[],
    name: string,
    others: readonly { id: string; name: string }[],
    selfId: string | null,
): ServiceProblem[] {
    const taken = sameNameAs(name, others, selfId);
    if (!taken || problems.some((p) => p.field === "name")) {
        return [...problems];
    }
    return [{ field: "name", message: sameNameLine(taken.name) }, ...problems];
}

// ---------------------------------------------------------------------
// How long, on a service with bookings
// ---------------------------------------------------------------------

/**
 * Under How long on a saved service: the time each visit takes of whose
 * day, and that bookings already made keep their length.
 */
export function lengthNote({
    minutes,
    savedMinutes,
    gap,
    names,
    comingUp,
}: {
    minutes: string;
    savedMinutes: string;
    gap: string;
    names: readonly string[];
    comingUp: number | null;
}): string {
    const m = Number(minutes) || 0;
    const g = Number(gap) || 0;
    const whose =
        names.length === 1 ? `${names[0]}'s time` : "the time of who does it";
    const needed = g
        ? `With the ${g} min break after, each visit takes ${m} min + ${g} min break of ${whose}.`
        : `Each visit takes ${m} min of ${whose}.`;
    const changed = minutes.trim() !== savedMinutes.trim();
    if (!changed || !comingUp) return needed;
    return `${needed} ${count(comingUp, "booking")} already made keep ${Number(savedMinutes) || 0} min.`;
}

/** The toast after a new length is saved. */
export function lengthSaved(
    minutes: string,
    savedMinutes: string,
    comingUp: number | null,
): string {
    const now = `Saved: ${Number(minutes) || 0} min.`;
    if (!comingUp) return `${now} New bookings use it.`;
    return `${now} New bookings use it, and ${comingUp} already made keep ${Number(savedMinutes) || 0} min.`;
}
