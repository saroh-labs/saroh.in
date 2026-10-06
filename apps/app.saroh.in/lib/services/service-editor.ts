/**
 * The Service Editor's rules (E2, the "Saroh Service Editor" design): the
 * draft it edits, what it needs before it can be saved, what it sends, and
 * the words around it. Pure and client-safe, so the editor and its tests
 * agree.
 *
 * Visits arrived with E10, when the booking page honours them: a
 * one-to-one service of more than one visit is a treatment, sold as one
 * order. "At booking, they pay" arrived with E8.
 */

import { formatMoney } from "@/lib/format/money";
import { rateOption } from "@/lib/invoices/gst";
import type { BookingPayment } from "@/lib/staff/types";

import type {
    CreateServiceInput,
    DepositMode,
    LocationType,
    Service,
    UpdateServiceInput,
} from "./service";
import type { ServiceUsage } from "./usage";

export type ServiceKind = "one" | "class";

/** The API's refusal of a treatment with no storefront (E10, DEC-050). */
export const TREATMENT_NEEDS_STOREFRONT =
    "Treatments are sold as orders — add a location first.";

/**
 * Whether a service needs its meeting link: when it happens online, or the
 * customer may choose online (Either). The API refuses it without one.
 */
export function needsMeetingLink(where: LocationType): boolean {
    return where !== "IN_PERSON";
}

/** Everything the editor edits, as typed. */
export interface ServiceDraft {
    // What it is
    name: string;
    description: string;
    kind: ServiceKind;
    // Time, and where
    minutes: string;
    gap: string;
    /** Visits one booking of it is, 1 to 12 (E10); one-to-one only. */
    visits: string;
    places: string;
    where: LocationType;
    meetingUrl: string;
    // Price
    /** As typed: "1200", "1,200", "499.50"; 0 is free, blank is unset. */
    price: string;
    /** What is paid at booking (E8): nothing, a share, or all of it. */
    deposit: DepositMode;
    // Who takes it
    staffIds: string[];
    // The booking page, and taking bookings
    showOnBookingPage: boolean;
    taking: boolean;
    // More settings
    timezone: string;
    bufferBefore: string;
    gstRate: string;
    sacCode: string;
}

/** Whole minutes from a field, or 0. */
export function wholeNumber(value: string): number {
    const n = Number(value.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/** Whole minutes when the field holds only digits, else NaN. */
function strictWhole(value: string): number {
    return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

/**
 * An amount as typed to minor units, without floating point:
 * "1,200.5" → 120050. Blank is null; anything else that is not an amount
 * is NaN.
 */
export function toMinor(value: string): number | null {
    const clean = value.replace(/[,\s₹]/g, "");
    if (!clean) return null;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
    if (!match) return Number.NaN;
    const [, whole = "0", fraction = ""] = match;
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Minor units back to what the field shows: 120050 → "1200.50". */
export function fromMinor(minor: number | null): string {
    if (minor === null) return "";
    const whole = Math.floor(minor / 100);
    const paise = minor % 100;
    return paise ? `${whole}.${String(paise).padStart(2, "0")}` : String(whole);
}

/** Who takes a service, from the people on the diary. */
export function staffFor(
    serviceId: string,
    staff: readonly { id: string; serviceIds: string[] }[],
): string[] {
    return staff
        .filter((p) => p.serviceIds.includes(serviceId))
        .map((p) => p.id);
}

/**
 * The draft a saved service opens with, or a new one's. A new service
 * starts at 30 minutes with a 10-minute gap, in person, on the booking page
 * and in the business's time zone.
 */
export function draftOf(
    service: Service | null,
    staffIds: string[],
    timezone: string,
): ServiceDraft {
    if (!service) {
        return {
            name: "",
            description: "",
            kind: "one",
            minutes: "30",
            gap: "10",
            visits: "1",
            places: "",
            where: "IN_PERSON",
            meetingUrl: "",
            price: "",
            deposit: "NONE",
            staffIds: [],
            showOnBookingPage: true,
            taking: true,
            timezone,
            bufferBefore: "0",
            gstRate: "",
            sacCode: "",
        };
    }
    const isClass = service.capacity > 1;
    return {
        name: service.name,
        description: service.description ?? "",
        kind: isClass ? "class" : "one",
        minutes: String(service.durationMinutes),
        gap: String(service.bufferAfterMinutes),
        visits: String(isClass ? 1 : Math.max(1, service.visits)),
        places: isClass ? String(service.capacity) : "",
        where: service.locationType,
        meetingUrl: service.meetingUrl ?? "",
        price: fromMinor(service.priceCents),
        deposit: service.depositMode,
        staffIds: [...staffIds].sort(),
        showOnBookingPage: service.showOnBookingPage,
        taking: service.status === "ACTIVE",
        timezone: service.timezone,
        bufferBefore: String(service.bufferBeforeMinutes),
        gstRate: rateOption(service.gstRate),
        sacCode: service.sacCode ?? "",
    };
}

function isHttps(link: string): boolean {
    try {
        return new URL(link).protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Everything that stops the draft being saved, in the order the page reads,
 * each as a sentence. Nobody taking it is refused only when the business
 * has people on the diary; with none, a service keeps its own weekly hours.
 */
export function serviceProblems(
    draft: ServiceDraft,
    hasStaff: boolean,
    /** No storefront to sell a treatment from (E10). */
    noStorefront = false,
): string[] {
    const problems: string[] = [];
    if (!draft.name.trim()) problems.push("Add a name.");
    const minutes = strictWhole(draft.minutes);
    if (!(minutes >= 5)) {
        problems.push("Each visit needs a length of at least 5 minutes.");
    } else if (minutes > 1440) {
        problems.push("A visit can be 24 hours at most.");
    }
    if (!(strictWhole(draft.gap) <= 1440)) {
        problems.push("The gap after has to be a number of minutes.");
    }
    if (draft.kind === "one") {
        const visits = strictWhole(draft.visits);
        if (!(visits >= 1 && visits <= 12)) {
            problems.push("Visits has to be between 1 and 12.");
        } else if (visits > 1 && noStorefront) {
            problems.push(TREATMENT_NEEDS_STOREFRONT);
        }
    }
    if (draft.kind === "class" && !(strictWhole(draft.places) >= 2)) {
        problems.push("A class needs at least 2 places.");
    }
    const link = draft.meetingUrl.trim();
    if (needsMeetingLink(draft.where) && !link) {
        problems.push("Paste the link people join by.");
    } else if (needsMeetingLink(draft.where) && !isHttps(link)) {
        problems.push(
            "The link has to be a full https:// link, like https://meet.google.com/abc-defg-hij.",
        );
    }
    const price = toMinor(draft.price);
    if (price === null) problems.push("Add a price (0 if it's free).");
    else if (Number.isNaN(price)) {
        problems.push("Write the price as a number, like 1200.");
    } else if (draft.deposit !== "NONE" && price === 0) {
        // The API's own sentence (E8): a deposit is a share of a price.
        problems.push(
            "A deposit is part of the price. Set a price first, or take nothing at booking.",
        );
    }
    if (hasStaff && draft.staffIds.length === 0) {
        problems.push("Pick who takes it.");
    }
    if (!(strictWhole(draft.bufferBefore) <= 1440)) {
        problems.push("The buffer before has to be a number of minutes.");
    }
    if (!draft.timezone.trim()) problems.push("Pick a time zone.");
    const sac = draft.sacCode.replace(/\s+/g, "");
    if (sac && !/^\d{4,8}$/.test(sac)) {
        problems.push("A SAC code is 4 to 8 digits.");
    }
    return problems;
}

/** How many visits the draft is: one for a class, else as typed (1–12). */
export function draftVisits(draft: Pick<ServiceDraft, "kind" | "visits">) {
    if (draft.kind === "class") return 1;
    return Math.min(12, Math.max(1, wholeNumber(draft.visits) || 1));
}

/**
 * What saving sends: the visits (E10; a class is always one), and the link
 * only for a service that can happen online. The deposit is its mode; the
 * amount is always the server's (E8).
 */
export function serviceInput(
    draft: ServiceDraft,
    currency: string,
): CreateServiceInput {
    const online = needsMeetingLink(draft.where);
    const sac = draft.sacCode.replace(/\s+/g, "");
    return {
        name: draft.name.trim(),
        description: draft.description.trim(),
        durationMinutes: wholeNumber(draft.minutes),
        bufferBeforeMinutes: wholeNumber(draft.bufferBefore),
        bufferAfterMinutes: wholeNumber(draft.gap),
        capacity: draft.kind === "class" ? wholeNumber(draft.places) : 1,
        priceCents: toMinor(draft.price) ?? 0,
        currency,
        gstRate: draft.gstRate || null,
        sacCode: sac || null,
        timezone: draft.timezone.trim(),
        locationType: draft.where,
        meetingUrl: online ? draft.meetingUrl.trim() : null,
        showOnBookingPage: draft.showOnBookingPage,
        depositMode: draft.deposit,
        visits: draftVisits(draft),
    };
}

/** What saving a saved service sends: its fields, and whether it takes bookings. */
export function serviceUpdate(
    draft: ServiceDraft,
    currency: string,
): UpdateServiceInput {
    return {
        ...serviceInput(draft, currency),
        status: draft.taking ? "ACTIVE" : "ARCHIVED",
    };
}

/** The editor's sections, as the leave dialog names them. */
const SECTIONS: [string, (keyof ServiceDraft)[]][] = [
    ["What it is", ["name", "description", "kind"]],
    ["Time", ["minutes", "gap", "visits", "places", "where", "meetingUrl"]],
    ["Price", ["price", "deposit"]],
    ["Who takes it", ["staffIds"]],
    ["Booking page", ["showOnBookingPage"]],
    ["Taking bookings", ["taking"]],
    ["More settings", ["timezone", "bufferBefore", "gstRate", "sacCode"]],
];

function same(a: ServiceDraft, b: ServiceDraft, key: keyof ServiceDraft) {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) {
        return [...x].sort().join() === [...y].sort().join();
    }
    return x === y;
}

/** The sections whose fields differ from the saved draft, in page order. */
export function changedSections(
    saved: ServiceDraft,
    draft: ServiceDraft,
): string[] {
    return SECTIONS.filter(([, keys]) =>
        keys.some((k) => !same(saved, draft, k)),
    ).map(([name]) => name);
}

function bookingsCount(n: number): string {
    return n === 1 ? "1 booking" : `${n} bookings`;
}

/** The line under the title: unsaved, new, or what is still to come. */
/**
 * What the Service Editor says in place of its buttons to someone without
 * `service:write` ("Change services, hours, time off and booking rules",
 * E26): its fields are disabled, and it says why in plain words.
 */
export const VIEW_ONLY =
    "View only — your role can't change services, hours or booking rules.";

export function stateLine({
    isNew,
    dirty,
    comingUp,
}: {
    isNew: boolean;
    dirty: boolean;
    /** Null when the bookings could not be counted. */
    comingUp: number | null;
}): string {
    if (dirty) return "Unsaved changes";
    if (isNew) return "Not saved yet";
    if (comingUp === null) return "";
    return comingUp
        ? `${bookingsCount(comingUp)} still to come`
        : "Nothing booked yet";
}

/** The pill beside the title: new, or whether it takes bookings. */
export function statePill(
    isNew: boolean,
    taking: boolean,
): { label: string; tone: "neutral" | "success" } {
    if (isNew) return { label: "New", tone: "neutral" };
    return taking
        ? { label: "Taking bookings", tone: "success" }
        : { label: "Not taking bookings", tone: "neutral" };
}

/** What the Save toast says. */
export function savedMessage({
    isNew,
    name,
    kind,
    comingUp,
}: {
    isNew: boolean;
    name: string;
    kind: ServiceKind;
    comingUp: number | null;
}): string {
    if (isNew) {
        return kind === "class"
            ? `${name} added. Set its weekly times under More settings.`
            : `${name} added. It's bookable now.`;
    }
    if (!comingUp) {
        return comingUp === 0
            ? "Saved. New bookings use it; nothing already booked changes."
            : "Saved. New bookings use it; bookings already made keep their details.";
    }
    return `Saved. New bookings use it; ${
        comingUp === 1
            ? "1 booking already made keeps"
            : `${comingUp} bookings already made keep`
    } the old details.`;
}

/** The note under Time. */
export function timeNote(
    kind: ServiceKind,
    hasStaff: boolean,
    visits = 1,
    minutes = 0,
): string {
    if (kind === "class")
        return "A class runs at set times; people book a place.";
    if (visits > 1) {
        return `${visits} visits of ${minutes || "?"} min, booked one at a time. The order is fulfilled after the last visit.`;
    }
    return hasStaff
        ? "Fills the free time of whoever takes it, with the gap kept free after."
        : "Books in its own weekly hours, set under More settings, with the gap kept free after.";
}

/** Each deposit's share of the price, in percent — the server's too. */
const DEPOSIT_PERCENT: Record<DepositMode, number> = {
    NONE: 0,
    PERCENT_25: 25,
    PERCENT_50: 50,
    FULL: 100,
};

/**
 * The note under "At booking, they pay" (the design's): what a customer
 * pays when booking and at the visit, worked out from the price as typed,
 * rounded to the paisa as the server rounds it.
 */
export function depositNote(
    deposit: DepositMode,
    price: string,
    currency: string,
    visits = 1,
    /** How the business takes payment when people book (DEC-088). */
    way: BookingPayment = "BOTH",
): string {
    const minor = toMinor(price);
    const cents = minor === null || Number.isNaN(minor) ? 0 : minor;
    const money = (n: number) => formatMoney(n, currency) ?? "";
    if (deposit === "NONE") {
        // Online only: nothing at the visit, it is all paid when booking.
        return way === "ONLINE" && cents > 0
            ? `They pay ${money(cents)} online when booking: your booking rules take payment online only.`
            : "No card needed to book. No-shows cost you the slot.";
    }
    const now = Math.round((cents * DEPOSIT_PERCENT[deposit]) / 100);
    const split =
        deposit === "FULL"
            ? `They pay ${money(now)} when booking.`
            : `They pay ${money(now)} when booking, and the rest (${money(cents - now)}) ${visits > 1 ? "over the visits" : "at the visit"}.`;
    return `${split} Refunded if they cancel in time.`;
}

/**
 * The note under "At booking, they pay" for a deposit the plan can't take
 * online: kept, and not taken until it can (6 Oct 2026).
 */
export const depositPausedNote =
    "Paused: customers book and pay at the visit, and nothing is taken when booking.";

/** The note under Where. */
export function whereNote(where: LocationType): string {
    if (where === "IN_PERSON") return "They come to you.";
    if (where === "ONLINE") {
        return "They join by the link below. Everyone who books gets the same one.";
    }
    return "They pick when booking. Online visits join by the link below.";
}

/**
 * The note under "Show on the booking page". Null `hasPage` is "couldn't
 * tell", which says only what the switch does.
 */
export function bookingPageNote(hasPage: boolean | null, on: boolean): string {
    if (hasPage === false) {
        return "You don't have a booking page yet. Staff can still book it from the calendar.";
    }
    return on
        ? "Customers can book it themselves."
        : "Only staff can book it, from the calendar.";
}

/** The note under Who takes it. */
export function staffNote(
    staffIds: string[],
    people: readonly { id: string; name: string }[],
): string {
    if (staffIds.length > 1) {
        return "Customers can pick who, or take whoever's free first.";
    }
    const only = people.find((p) => p.id === staffIds[0]);
    if (only) return `Only ${only.name}'s free time is offered.`;
    return "Nobody picked yet.";
}

/** The "At a glance" rows: label and value. */
export function glance(
    draft: ServiceDraft,
    usage: ServiceUsage | null,
    currency: string,
): [string, string][] {
    const price = toMinor(draft.price);
    const minutes = wholeNumber(draft.minutes);
    const gap = wholeNumber(draft.gap);
    const priceText =
        price === null || Number.isNaN(price)
            ? "—"
            : price === 0
              ? "Free"
              : (formatMoney(price, currency) ?? "—");
    const counted = (n: number | undefined) =>
        usage ? String(n ?? 0) : "Couldn't count";
    // A treatment (E10): its price is for every visit, and so is its time.
    const visits = draftVisits(draft);
    if (visits > 1) {
        const whole = price !== null && !Number.isNaN(price) && price > 0;
        return [
            ["Price", whole ? `${priceText} for ${visits} visits` : priceText],
            ...(whole
                ? [
                      [
                          "Per visit",
                          formatMoney(Math.round(price / visits), currency) ??
                              "—",
                      ] as [string, string],
                  ]
                : []),
            ["Time needed", `${visits} × ${minutes} min`],
            ["Booked this week", counted(usage?.thisWeek)],
            ["Still to come", counted(usage?.comingUp)],
        ];
    }
    return [
        ["Price", priceText],
        ["Time needed", `${minutes} min + ${gap} min gap`],
        ["Booked this week", counted(usage?.thisWeek)],
        ["Still to come", counted(usage?.comingUp)],
    ];
}

/**
 * Whether the business runs classes, so the editor shows Kind up front: it
 * has one, it has no services yet, or this one is a class. A business of
 * one-to-one services only (a clinic) finds Kind under More settings.
 */
export function showKind(
    services: readonly { id: string; capacity: number }[],
    editing: { capacity: number } | null,
): boolean {
    if (editing && editing.capacity > 1) return true;
    if (services.length === 0) return true;
    return services.some((s) => s.capacity > 1);
}
