/**
 * The Service Editor's panels and rows (U16, #1032): which fields each
 * side panel holds, its title and sentence, More details' rows on a new
 * service and the three cards of a saved one, and how its own hours read
 * in a row. Pure and client-safe; the words around the questions and the
 * live line are `service-form.ts`'s.
 */

import { formatClockRange } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { ServiceDraft, ServiceField } from "./service-editor";
import { draftVisits, toMinor } from "./service-editor";
import { freeTimeOf, listWords } from "./service-form";
import type { HoursRow } from "./service-hours-draft";
import { timeToMinutes } from "./service-hours-draft";

// ---------------------------------------------------------------------
// More details (new) and the group cards (edit)
// ---------------------------------------------------------------------

/** A side panel: one row of More details, or one card of a saved service. */
export type PanelKey =
    | "describe"
    | "breakAfter"
    | "breakBefore"
    | "where"
    | "visits"
    | "hours"
    | "pay"
    | "gst"
    | "timezone"
    | "what"
    | "time"
    | "money";

/** The fields each panel holds: what its Save is judged on. */
export const PANEL_FIELDS: Record<PanelKey, readonly ServiceField[]> = {
    describe: [],
    breakAfter: ["gap"],
    breakBefore: ["bufferBefore"],
    where: ["meetingUrl"],
    visits: ["visits"],
    hours: ["hours"],
    pay: ["price"],
    gst: ["gstRate", "sacCode"],
    timezone: ["timezone"],
    what: ["name", "places", "staffIds"],
    time: ["minutes", "gap", "bufferBefore", "meetingUrl", "hours", "timezone"],
    money: ["price", "gstRate", "sacCode", "visits"],
};

/** Each panel's title. */
export const PANEL_TITLE: Record<PanelKey, string> = {
    describe: "What to tell customers",
    breakAfter: "Break after",
    breakBefore: "Break before",
    where: "Where",
    visits: "Visits in a package",
    hours: "When it can be booked",
    pay: "At booking, they pay",
    gst: "GST and SAC code",
    timezone: "Time zone",
    what: "What it is",
    time: "Time and place",
    money: "Money",
};

/** The one sentence under each panel's title. */
export const PANEL_SAYS: Record<PanelKey, string> = {
    describe: "Shown on your booking page under the name.",
    breakAfter: "Time kept free after each visit, to tidy up or write notes.",
    breakBefore: "Time kept free before each visit, to get ready.",
    where: "In person, online with a link to join, or either.",
    visits: "More than one visit makes it a package, booked one visit at a time.",
    hours: "Its own weekly hours. They start from your opening hours.",
    pay: "Nothing, a deposit, or the full price when they book.",
    gst: "The rate its price includes, and the code printed on tax invoices.",
    timezone: "The zone its times are kept in.",
    what: "Its name, who comes, what customers read, and who does it.",
    time: "How long it takes, the breaks, where, and when it can be booked.",
    money: "Its price, GST, what they pay when booking, and visits in a package.",
};

function minutesWords(value: string, none = "None"): string {
    const n = Number(value.replace(/[^0-9]/g, "")) || 0;
    return n ? `${n} min` : none;
}

const WHERE_WORDS: Record<ServiceDraft["where"], string> = {
    IN_PERSON: "In person",
    ONLINE: "Online, with a link to join",
    EITHER: "In person or online, they choose",
};

const DEPOSIT_WORDS: Record<ServiceDraft["deposit"], string> = {
    NONE: "Nothing, they pay at the visit",
    PERCENT_25: "25% deposit, the rest at the visit",
    PERCENT_50: "50% deposit, the rest at the visit",
    FULL: "The full price",
};

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Which days its own hours cover: "Mon to Sat", "Mon, Wed and Fri",
 * "Every day". Monday first.
 */
export function daysWords(rows: readonly HoursRow[]): string {
    const days = Array.from(new Set(rows.map((r) => r.dayOfWeek))).sort(
        (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
    );
    if (days.length === 7) return "Every day";
    const order = days.map((d) => (d + 6) % 7);
    const run = order.every((d, i) => i === 0 || d === (order[i - 1] ?? 0) + 1);
    const names = days.map((d) => SHORT_DAYS[d] ?? "");
    if (run && names.length > 2) return `${names[0]} to ${names.at(-1)}`;
    return listWords(names);
}

/** When it can be booked, in a row: whose hours, or its own. */
export function whenWords(
    draft: Pick<ServiceDraft, "kind" | "staffIds" | "hours">,
    names: readonly string[],
    hoursRead: boolean,
): string {
    if (!hoursRead) return "Its own hours couldn't be read";
    const own = draft.hours.length;
    if (draft.kind === "one" && names.length > 0) {
        const whose = freeTimeOf("one", names).replace(/ free time$/, " hours");
        return own
            ? `In ${whose}, inside its own hours (${daysWords(draft.hours)})`
            : `In ${whose} · or give it its own`;
    }
    if (!own) {
        return draft.kind === "class"
            ? "No weekly times yet"
            : "No weekly hours yet";
    }
    return draft.kind === "class"
        ? `Its own weekly times · ${daysWords(draft.hours)}`
        : `Its own weekly hours · ${daysWords(draft.hours)}`;
}

/** The time zone, said only as different when it is. */
export function zoneWords(zone: string, business: string, short: string) {
    return zone === business
        ? `Same as your business (${short || zone})`
        : zone;
}

export interface RowsInput {
    draft: ServiceDraft;
    /** Call names of who does it. */
    names: readonly string[];
    /** Names of everyone who does it, in full, for the What it is card. */
    fullNames: readonly string[] | null;
    currency: string;
    businessZone: string;
    /** The zone's short name: "IST". */
    zoneShort: string;
    hoursRead: boolean;
    /** Where GST is drawn (`gstPlace`). */
    gstAt: "price" | "more" | "none";
}

/** One row of More details: its panel, its name and what it holds. */
export interface DetailRow {
    panel: PanelKey;
    label: string;
    value: string;
    /** It doesn't apply (visits for a class): read, never opened. */
    off?: boolean;
}

/** More details on a new service, in the board's order. */
export function detailRows(input: RowsInput): DetailRow[] {
    const { draft, names, businessZone, zoneShort, hoursRead, gstAt } = input;
    const rows: DetailRow[] = [
        {
            panel: "describe",
            label: "What to tell customers",
            value:
                draft.description.trim() ||
                "Shown on your booking page under the name",
        },
        {
            panel: "breakAfter",
            label: "Break after",
            value: draft.gap.trim()
                ? `${minutesWords(draft.gap)} kept free after each visit`
                : "None",
        },
        {
            panel: "breakBefore",
            label: "Break before",
            value: minutesWords(draft.bufferBefore),
        },
        { panel: "where", label: "Where", value: WHERE_WORDS[draft.where] },
        draft.kind === "class"
            ? {
                  panel: "visits",
                  label: "Visits in a package",
                  value: "Not for classes",
                  off: true,
              }
            : {
                  panel: "visits",
                  label: "Visits in a package",
                  value: count(draftVisits(draft), "visit"),
              },
        {
            panel: "hours",
            label: "When it can be booked",
            value: whenWords(draft, names, hoursRead),
        },
        {
            panel: "pay",
            label: "At booking, they pay",
            value: DEPOSIT_WORDS[draft.deposit],
        },
    ];
    if (gstAt !== "none") {
        rows.push({
            panel: "gst",
            label: "GST and SAC code",
            value: gstWords(draft),
        });
    }
    rows.push({
        panel: "timezone",
        label: "Time zone",
        value: zoneWords(draft.timezone, businessZone, zoneShort),
    });
    return rows;
}

function gstWords(draft: Pick<ServiceDraft, "gstRate" | "sacCode">): string {
    const rate = draft.gstRate ? `${draft.gstRate}% GST` : "No GST rate yet";
    const sac = draft.sacCode.trim()
        ? `SAC ${draft.sacCode.trim()}`
        : "no SAC code";
    return `${rate} · ${sac}`;
}

/** A row of a saved service's card: what it is, and the panel it opens. */
export interface CardRow {
    label: string;
    value: string;
    panel: PanelKey;
}

export interface Card {
    panel: "what" | "time" | "money";
    title: string;
    rows: CardRow[];
}

/** A saved service as three cards, each opening its own panel. */
export function editCards(input: RowsInput): Card[] {
    const { draft, names, fullNames, currency, gstAt } = input;
    const price = toMinor(draft.price);
    const priceText =
        price === null || Number.isNaN(price)
            ? "Not set"
            : price === 0
              ? "Free"
              : formatMoney(price, currency);
    const visits = draftVisits(draft);
    const who =
        fullNames === null
            ? "Couldn't be read"
            : fullNames.length
              ? listWords(fullNames)
              : "Nobody yet";
    const what: CardRow[] = [
        { label: "Name", value: draft.name.trim() || "Not set", panel: "what" },
        {
            label: "Who comes",
            value:
                draft.kind === "class"
                    ? `A group class of ${draft.places.trim() || "?"}`
                    : "One person",
            panel: "what",
        },
        {
            label: "What to tell customers",
            value: draft.description.trim() || "Not added",
            panel: "what",
        },
        { label: "Who does it", value: who, panel: "what" },
    ];
    const time: CardRow[] = [
        {
            label: "How long",
            value: minutesWords(draft.minutes, "Not set"),
            panel: "time",
        },
        {
            label: "Break after",
            value: minutesWords(draft.gap),
            panel: "time",
        },
        {
            label: "Break before",
            value: minutesWords(draft.bufferBefore),
            panel: "time",
        },
        { label: "Where", value: WHERE_WORDS[draft.where], panel: "time" },
        {
            label: "When it can be booked",
            value: whenWords(draft, names, input.hoursRead),
            panel: "time",
        },
        {
            label: "Time zone",
            value: zoneWords(
                draft.timezone,
                input.businessZone,
                input.zoneShort,
            ),
            panel: "time",
        },
    ];
    const money: CardRow[] = [
        {
            label: "Price",
            value:
                gstAt !== "none" && draft.gstRate
                    ? `${priceText} · ${draft.gstRate}% GST`
                    : priceText,
            panel: "money",
        },
    ];
    if (gstAt !== "none") {
        money.push({
            label: "SAC code",
            value:
                draft.sacCode.trim() || "Not added · printed on tax invoices",
            panel: "money",
        });
    }
    money.push({
        label: "At booking, they pay",
        value: DEPOSIT_WORDS[draft.deposit],
        panel: "money",
    });
    if (draft.kind === "one") {
        money.push({
            label: "Visits in a package",
            value: count(visits, "visit"),
            panel: "money",
        });
    }
    return [
        { panel: "what", title: "What it is", rows: what },
        { panel: "time", title: "Time and place", rows: time },
        { panel: "money", title: "Money", rows: money },
    ];
}

/** "9:00 am to 7:00 pm" for a row of its own hours. */
export function windowWords(row: HoursRow): string {
    const start = timeToMinutes(row.start);
    const end = timeToMinutes(row.end);
    if (start === null || end === null) return "Not set";
    return formatClockRange(start, end === 1440 ? 0 : end);
}
