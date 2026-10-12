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
import { count } from "@/lib/format/plural";
import type { GstPriceMode, ItemModeValue } from "@/lib/gst/price-mode";
import {
    effectiveMode,
    isGstPriceMode,
    itemModeInput,
    itemModeValue,
    rateBps,
    SAME_AS_BUSINESS,
} from "@/lib/gst/price-mode";
import { GST_RATE_NEEDED, rateOption } from "@/lib/invoices/gst";
import type { BookingPayment } from "@/lib/staff/types";
import { absentText } from "@saroh/ui/lib/absent";

import type {
    CreateServiceInput,
    DepositMode,
    LocationType,
    Service,
    UpdateServiceInput,
} from "./service";
import type { HoursRow } from "./service-hours-draft";
import { hoursProblems, sameHours } from "./service-hours-draft";
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
    /**
     * How this price carries GST when it differs from the business's way
     * (12 Oct 2026); "" is "same as the business".
     */
    gstPriceMode: ItemModeValue;
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
    /**
     * Its own weekly hours, saved with the page's one Save in a call of
     * their own (`service-hours-draft.ts`).
     */
    hours: HoursRow[];
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
    /** Its saved hours, or what a new one starts with (`startingHours`). */
    hours: readonly HoursRow[] = [],
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
            gstPriceMode: SAME_AS_BUSINESS,
            // The one person on the diary, when there is only one.
            staffIds: [...staffIds],
            showOnBookingPage: true,
            taking: true,
            timezone,
            bufferBefore: "0",
            gstRate: "",
            sacCode: "",
            hours: [...hours],
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
        gstPriceMode: itemModeValue(service.gstPriceMode),
        staffIds: [...staffIds].sort(),
        showOnBookingPage: service.showOnBookingPage,
        taking: service.status === "ACTIVE",
        timezone: service.timezone,
        bufferBefore: String(service.bufferBeforeMinutes),
        gstRate: rateOption(service.gstRate),
        sacCode: service.sacCode ?? "",
        hours: [...hours],
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
 * Whether the draft still has to choose its GST rate: a GST-registered
 * business's service with a price above nothing and no rate. 0% is a rate
 * ("exempt or nil-rated"); a free service is never asked, and neither is a
 * business that isn't registered.
 */
export function needsGstRate(
    draft: Pick<ServiceDraft, "price" | "gstRate">,
    gstRegistered: boolean,
): boolean {
    if (!gstRegistered || draft.gstRate !== "") return false;
    const price = toMinor(draft.price);
    return price !== null && !Number.isNaN(price) && price > 0;
}

/**
 * Where the GST rate and the SAC code sit. Beside the price for a
 * registered business, which has to answer it. For a business that isn't
 * registered they aren't drawn at all, unless one was saved before: that
 * stays in view under More settings (00-universal §15). When the page
 * couldn't tell (`null`), they stay under More settings as they were, and
 * nothing is asked.
 */
export function gstPlace(
    gstRegistered: boolean | null,
    saved: Pick<ServiceDraft, "gstRate" | "sacCode">,
): "price" | "more" | "none" {
    if (gstRegistered === true) return "price";
    if (gstRegistered === null) return "more";
    return saved.gstRate !== "" || saved.sacCode.trim() !== ""
        ? "more"
        : "none";
}

/** The field a problem is about: where its sentence is shown. */
export type ServiceField =
    | "name"
    | "minutes"
    | "gap"
    | "visits"
    | "places"
    | "meetingUrl"
    | "price"
    | "gstRate"
    | "staffIds"
    | "bufferBefore"
    | "timezone"
    | "sacCode"
    | "hours";

export interface ServiceProblem {
    field: ServiceField;
    message: string;
    /** For `hours`: which row, from 0. */
    row?: number;
}

/**
 * The same problems as {@link serviceProblems}, each with the field it is
 * about, so the page can say it under that field and put the keyboard on
 * the first one when Save is pressed.
 */
export function serviceFieldProblems(
    draft: ServiceDraft,
    hasStaff: boolean,
    /** No storefront to sell a treatment from (E10). */
    noStorefront = false,
    /** Exactly one person is on the diary. */
    onePerson = false,
    /**
     * The business is GST-registered: a priced service needs the rate its
     * price includes, or its tax invoice shows no GST (12 Oct 2026).
     */
    gstRegistered = false,
): ServiceProblem[] {
    const problems: ServiceProblem[] = [];
    const say = (field: ServiceField, message: string) =>
        problems.push({ field, message });
    if (!draft.name.trim()) say("name", "Add a name.");
    const minutes = strictWhole(draft.minutes);
    if (!(minutes >= 5)) {
        say("minutes", "Each visit needs a length of at least 5 minutes.");
    } else if (minutes > 1440) {
        say("minutes", "A visit can be 24 hours at most.");
    }
    if (!(strictWhole(draft.gap) <= 1440)) {
        say("gap", "The gap after has to be a number of minutes.");
    }
    if (draft.kind === "one") {
        const visits = strictWhole(draft.visits);
        if (!(visits >= 1 && visits <= 12)) {
            say("visits", "Visits has to be between 1 and 12.");
        } else if (visits > 1 && noStorefront) {
            say("visits", TREATMENT_NEEDS_STOREFRONT);
        }
    }
    if (draft.kind === "class" && !(strictWhole(draft.places) >= 2)) {
        say("places", "A class needs at least 2 places.");
    }
    const link = draft.meetingUrl.trim();
    if (needsMeetingLink(draft.where) && !link) {
        say("meetingUrl", "Paste the link people join by.");
    } else if (needsMeetingLink(draft.where) && !isHttps(link)) {
        say(
            "meetingUrl",
            "The link has to be a full https:// link, like https://meet.google.com/abc-defg-hij.",
        );
    }
    const price = toMinor(draft.price);
    if (price === null) say("price", "Add a price (0 if it's free).");
    else if (Number.isNaN(price)) {
        say("price", "Write the price as a number, like 1200.");
    } else if (draft.deposit !== "NONE" && price === 0) {
        // The API's own sentence (E8): a deposit is a share of a price.
        say(
            "price",
            "A deposit is part of the price. Set a price first, or take nothing at booking.",
        );
    }
    if (needsGstRate(draft, gstRegistered)) say("gstRate", GST_RATE_NEEDED);
    if (hasStaff && !onePerson && draft.staffIds.length === 0) {
        say("staffIds", "Pick who takes it.");
    }
    if (!(strictWhole(draft.bufferBefore) <= 1440)) {
        say("bufferBefore", "The buffer before has to be a number of minutes.");
    }
    if (!draft.timezone.trim()) say("timezone", "Pick a time zone.");
    const sac = draft.sacCode.replace(/\s+/g, "");
    if (sac && !/^\d{4,8}$/.test(sac)) {
        say("sacCode", "A SAC code is 4 to 8 digits.");
    }
    for (const row of hoursProblems(draft.hours)) {
        problems.push({ field: "hours", message: row.message, row: row.index });
    }
    return problems;
}

/**
 * Everything that stops the draft being saved, in the order the page reads,
 * each as a sentence. Nobody taking it is refused only when the business
 * has people on the diary; with none, a service keeps its own weekly hours.
 * With exactly one person there is nobody to choose between, so it is not
 * asked for: a new service starts with them on it (`draftOf`).
 */
export function serviceProblems(
    draft: ServiceDraft,
    hasStaff: boolean,
    /** No storefront to sell a treatment from (E10). */
    noStorefront = false,
    /** Exactly one person is on the diary. */
    onePerson = false,
    /** The business is GST-registered. */
    gstRegistered = false,
): string[] {
    return serviceFieldProblems(
        draft,
        hasStaff,
        noStorefront,
        onePerson,
        gstRegistered,
    ).map((p) => p.message);
}

/** The first problem for a field (or a row of the hours), if it has one. */
export function problemFor(
    problems: readonly ServiceProblem[],
    field: ServiceField,
    row?: number,
): string | null {
    return (
        problems.find(
            (p) => p.field === field && (row === undefined || p.row === row),
        )?.message ?? null
    );
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
        // Null is "same as the business". A business that isn't registered
        // is never shown the choice, so what was saved goes back as it was.
        gstPriceMode: itemModeInput(draft.gstPriceMode),
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

/** The hours' own section name: they save in a call of their own. */
export const HOURS_SECTION = "Its weekly hours";

/** The editor's sections, as the leave dialog names them. */
const SECTIONS: [string, (keyof ServiceDraft)[]][] = [
    ["What it is", ["name", "description", "kind"]],
    ["Time", ["minutes", "gap", "visits", "places", "where", "meetingUrl"]],
    ["Price", ["price", "deposit", "gstPriceMode"]],
    ["Who takes it", ["staffIds"]],
    ["Booking page", ["showOnBookingPage"]],
    ["Taking bookings", ["taking"]],
    ["More settings", ["timezone", "bufferBefore", "gstRate", "sacCode"]],
    [HOURS_SECTION, ["hours"]],
];

function same(a: ServiceDraft, b: ServiceDraft, key: keyof ServiceDraft) {
    if (key === "hours") return sameHours(a.hours, b.hours);
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) {
        return [...x].sort().join() === [...y].sort().join();
    }
    return x === y;
}

/**
 * What a Save has to send, by the call it goes in: the service's own
 * fields (one call), who takes it (a call per person) and its weekly hours
 * (one call). After a Save that got part of the way, only what is left
 * differs from `saved`, so Try again sends only that.
 */
export function changedParts(
    saved: ServiceDraft,
    draft: ServiceDraft,
): { fields: boolean; who: boolean; hours: boolean } {
    const keys = Object.keys(draft) as (keyof ServiceDraft)[];
    return {
        fields: keys.some(
            (k) => k !== "staffIds" && k !== "hours" && !same(saved, draft, k),
        ),
        who: !same(saved, draft, "staffIds"),
        hours: !same(saved, draft, "hours"),
    };
}

/** The GST fields: under More settings, or beside the price (`gstPlace`). */
const GST_KEYS: (keyof ServiceDraft)[] = ["gstRate", "sacCode"];

/**
 * The sections whose fields differ from the saved draft, in page order.
 * `gstWithPrice`: the GST rate and SAC code are drawn under Price (a
 * GST-registered business), so a change to them is named there.
 */
export function changedSections(
    saved: ServiceDraft,
    draft: ServiceDraft,
    gstWithPrice = false,
): string[] {
    return SECTIONS.map(([name, keys]): [string, (keyof ServiceDraft)[]] => {
        if (!gstWithPrice) return [name, keys];
        if (name === "Price") return [name, [...keys, ...GST_KEYS]];
        return [name, keys.filter((k) => !GST_KEYS.includes(k))];
    })
        .filter(([, keys]) => keys.some((k) => !same(saved, draft, k)))
        .map(([name]) => name);
}

function bookingsCount(n: number): string {
    return count(n, "booking");
}

/** The line under the title: unsaved, new, or what is still to come. */
/**
 * What the Service Editor says in place of its buttons to someone without
 * `service:write` ("Change services, hours, time off and booking rules",
 * E26): its fields are disabled, and it says why in plain words.
 */
export const VIEW_ONLY =
    "View only. Your role can't change services, hours or booking rules.";

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
): { label: string; tone: "neutral" | "success" | "warning"; hint?: string } {
    if (isNew) return { label: "New", tone: "neutral" };
    // "Live" and "Paused", as every kind of thing says it; the service's
    // own sentence is the hint.
    return taking
        ? { label: "Live", tone: "success", hint: "Taking bookings." }
        : { label: "Paused", tone: "warning", hint: "Not taking bookings." };
}

/**
 * What the Save toast says. A new service is bookable only once it has
 * times (UX-024): a one-to-one someone takes books in their hours; with
 * nobody, or a class, it needs its own weekly hours first, and stays off
 * the booking page until then.
 */
export function savedMessage({
    isNew,
    name,
    kind,
    comingUp,
    hasPerson = false,
    hasHours = false,
}: {
    isNew: boolean;
    name: string;
    kind: ServiceKind;
    comingUp: number | null;
    /** Someone on the diary takes it. */
    hasPerson?: boolean;
    /** It was added with weekly hours of its own. */
    hasHours?: boolean;
}): string {
    if (isNew) {
        if (hasHours && (kind === "class" || !hasPerson)) {
            return `${name} added. Customers can book it in its weekly hours.`;
        }
        if (kind === "class") {
            return `${name} added. Set its weekly times under More settings so customers can book it.`;
        }
        return hasPerson
            ? `${name} added. Customers can book it in the free time of who takes it.`
            : `${name} added. Give it hours under More settings so customers can book it.`;
    }
    if (!comingUp) {
        return comingUp === 0
            ? "Saved. New bookings use it. Nothing already booked changes."
            : "Saved. New bookings use it. Bookings already made keep their details.";
    }
    return `Saved. New bookings use it, and ${
        comingUp === 1
            ? "1 booking already made keeps"
            : `${comingUp} bookings already made keep`
    } the old details.`;
}

/**
 * The note over a service's own weekly hours. They go with the page's Save;
 * a new service that started from the opening hours says so.
 */
export function hoursNote(
    timezone: string,
    startedFromOpening: boolean,
): string {
    const zone = `Weekly windows in ${timezone}, saved with the rest of the page.`;
    return startedFromOpening
        ? `${zone} They start from your opening hours: change them if this runs at other times.`
        : `${zone} With people on the diary, their free time inside these windows is what customers can book.`;
}

/** The note under Time. */
export function timeNote(
    kind: ServiceKind,
    hasStaff: boolean,
    visits = 1,
    minutes = 0,
): string {
    if (kind === "class")
        return "A class runs at set times, and people book a place.";
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
 * What the API charges for one booking of a saved service, GST and all:
 * the amount to pay, and the share of it taken when booking.
 */
export interface ServiceCharged {
    payCents: number;
    depositCents: number | null;
}

/**
 * The API's own figures for the price, while nothing that decides them has
 * been changed on the page. Null for a new service, an older API, or a
 * draft whose price, rate, GST choice or deposit differs from what is
 * saved: the page never works the GST out itself. Judged against the
 * service as read, so a save shows its new amounts only once the API has
 * answered with them.
 */
export function chargedAsSaved(
    service: Service | null,
    draft: Pick<
        ServiceDraft,
        "price" | "deposit" | "gstRate" | "gstPriceMode" | "kind" | "visits"
    >,
): ServiceCharged | null {
    if (!service || typeof service.payCents !== "number") return null;
    const asRead =
        toMinor(draft.price) === service.priceCents &&
        draft.deposit === service.depositMode &&
        draft.gstRate === rateOption(service.gstRate) &&
        draft.gstPriceMode === itemModeValue(service.gstPriceMode) &&
        draftVisits(draft) ===
            (service.capacity > 1 ? 1 : Math.max(1, service.visits));
    if (!asRead) return null;
    return {
        payCents: service.payCents,
        depositCents: service.depositCents,
    };
}

/**
 * The business's own way of carrying GST, for "Same as the business (…)":
 * as its settings said, else as a saved service priced the business's way
 * is charged (a role that can't read the settings still reads that). Null
 * when neither tells.
 */
export function businessModeFor(
    service: Pick<Service, "gstPriceMode" | "gst"> | null,
    read: GstPriceMode | null,
): GstPriceMode | null {
    if (read !== null) return read;
    if (!service || isGstPriceMode(service.gstPriceMode)) return null;
    return service.gst?.mode ?? null;
}

/**
 * Whether GST goes on top of the price as typed: a registered business's
 * priced service with a rate above 0, under "GST is added". False when the
 * business's way couldn't be told and the service follows it.
 */
export function gstGoesOnTop(
    draft: Pick<ServiceDraft, "gstRate" | "gstPriceMode">,
    business: GstPriceMode | null,
    registered: boolean,
): boolean {
    if (!registered || !((rateBps(draft.gstRate) ?? 0) > 0)) return false;
    if (business === null && !isGstPriceMode(draft.gstPriceMode)) return false;
    return effectiveMode(business, draft.gstPriceMode) === "ADDED";
}

/**
 * The note under "At booking, they pay" (the design's): what a customer
 * pays when booking and at the visit. A business that takes payment at the
 * desk only takes nothing when booking, a deposit or not (DEC-089).
 *
 * The amounts are the API's (`charged`) while the price is as saved. A
 * price being typed that includes its GST is the amount to pay, so its
 * split is said from it, rounded to the paisa as the server rounds it. One
 * that has GST added on top (`gstOnTop`) is not worked out here: the note
 * says the shares in words until it is saved.
 */
export function depositNote(
    deposit: DepositMode,
    price: string,
    currency: string,
    visits = 1,
    /** How the business takes payment when people book (DEC-088). */
    way: BookingPayment = "BOTH",
    gst: { charged?: ServiceCharged | null; gstOnTop?: boolean } = {},
): string {
    const minor = toMinor(price);
    const typed = minor === null || Number.isNaN(minor) ? 0 : minor;
    const charged = gst.charged ?? null;
    const cents = charged ? charged.payCents : typed;
    const money = (n: number) => formatMoney(n, currency);
    // GST on top of a price not saved yet: said in words, never summed.
    const inWords = !charged && gst.gstOnTop === true;
    const all = inWords ? "the price plus GST" : money(cents);
    const later = visits > 1 ? "over the visits" : "at the visit";
    if (deposit === "NONE") {
        // Online only: nothing at the visit, it is all paid when booking.
        return way === "ONLINE" && cents > 0
            ? `They pay ${all} online when booking: your booking rules take payment online only.`
            : "No card needed to book. No-shows cost you the time.";
    }
    if (way === "DESK" && cents > 0) return `They pay ${all} ${later}.`;
    const percent = DEPOSIT_PERCENT[deposit];
    if (inWords) {
        const split =
            deposit === "FULL"
                ? `They pay ${all} when booking.`
                : `They pay ${percent}% of ${all} when booking, and the rest ${later}.`;
        return `${split} Refunded if they cancel in time.`;
    }
    const now = charged?.depositCents ?? Math.round((cents * percent) / 100);
    const split =
        deposit === "FULL"
            ? `They pay ${money(now)} when booking.`
            : `They pay ${money(now)} when booking, and the rest (${money(cents - now)}) ${later}.`;
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
export function bookingPageNote(
    hasPage: boolean | null,
    on: boolean,
    /** It has times to offer: its own weekly hours, or (one-to-one) someone to take it (UX-024). */
    hasHours = true,
): string {
    if (hasPage === false) {
        return "You don't have a booking page yet. Staff can still book it from the calendar.";
    }
    if (on && !hasHours) {
        return "It goes on the booking page once it has weekly hours or someone to take it. Staff can book it from the calendar meanwhile.";
    }
    return on
        ? "Customers can book it themselves."
        : "Only staff can book it, from the calendar.";
}

/**
 * Whether a service has times the booking page can offer (UX-024), as the
 * API keeps it off the page until then: its own weekly hours, or a
 * one-to-one someone takes. A class's times are always its own hours.
 */
export function hasBookableHours(
    kind: ServiceKind,
    ruleCount: number,
    staffCount: number,
): boolean {
    return ruleCount > 0 || (kind === "one" && staffCount > 0);
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
            ? absentText()
            : price === 0
              ? "Free"
              : formatMoney(price, currency);
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
                          formatMoney(Math.round(price / visits), currency),
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
