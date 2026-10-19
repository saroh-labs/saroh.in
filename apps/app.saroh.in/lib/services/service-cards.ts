/**
 * The words on Bookings › Services' rows (U15, #1031; the boards
 * BKMServices and BKDStates): the count beside the heading, each row's
 * "how long · price · who" line and its booked line, the "Who can book
 * it" tag (DEC-170, Q5), what is said once above the list about services
 * nobody takes, and the "Taking bookings" switch. Pure, so the screen and
 * its tests agree.
 */

import { joinFacts } from "@/lib/format/join";
import { formatMoney } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";
import { setPriceWords } from "@/lib/gst/on-price";

import type { Service } from "./service";
import type { ServiceUsage } from "./usage";

/** What decides whether, and by whom, a service can be booked. */
export type WhoFields = Pick<
    Service,
    "status" | "showOnBookingPage" | "bookableByTeam"
>;

/**
 * "Who can book it" (DEC-170, Q5): customers on the booking page, the
 * team from Bookings, both, or neither, which is paused. A service paused
 * the old way (its status) is paused too.
 */
export type WhoCanBook = "both" | "customers" | "team" | "paused";

export function whoCanBook(s: WhoFields): WhoCanBook {
    if (s.status !== "ACTIVE") return "paused";
    if (s.showOnBookingPage && s.bookableByTeam) return "both";
    if (s.showOnBookingPage) return "customers";
    if (s.bookableByTeam) return "team";
    return "paused";
}

/** Whether the row's "Taking bookings" switch is on. */
export function isTaking(s: WhoFields): boolean {
    return whoCanBook(s) !== "paused";
}

/** The tag's words and tone; Paused is the status vocabulary's own. */
export const WHO_TAG: Record<
    Exclude<WhoCanBook, "paused">,
    { word: string; tone: "success" | "neutral" }
> = {
    both: { word: "Customers and team", tone: "success" },
    customers: { word: "Customers only", tone: "neutral" },
    team: { word: "Team only", tone: "neutral" },
};

/**
 * What the switch writes. Off unticks both boxes (nobody can book it,
 * bookings already made stay); on ticks both back, and takes a service
 * paused the old way off pause too (Q5, decided 19 Oct).
 */
export function takingPatch(taking: boolean): Partial<WhoFields> {
    return taking
        ? { status: "ACTIVE", showOnBookingPage: true, bookableByTeam: true }
        : { showOnBookingPage: false, bookableByTeam: false };
}

/** Only what differs between two states: what Undo sends back. */
export function whoPatch(from: WhoFields, to: WhoFields): Partial<WhoFields> {
    const out: Partial<WhoFields> = {};
    if (from.status !== to.status) out.status = to.status;
    if (from.showOnBookingPage !== to.showOnBookingPage) {
        out.showOnBookingPage = to.showOnBookingPage;
    }
    if (from.bookableByTeam !== to.bookableByTeam) {
        out.bookableByTeam = to.bookableByTeam;
    }
    return out;
}

/**
 * Beside the heading: one count. "6 services", and how many your booking
 * page offers only when that differs ("6 services · 4 on your booking
 * page"), or that there is no booking page yet. Null `hasPage` is
 * "couldn't tell", which counts as usual. Nothing at zero: the header
 * leaves a count out then.
 */
export function servicesCount(
    services: readonly WhoFields[],
    hasPage: boolean | null,
): string | undefined {
    if (services.length === 0) return undefined;
    const all = count(services.length, "service");
    if (hasPage === false) return joinFacts(all, "no booking page yet");
    const onPage = services.filter((s) => {
        const who = whoCanBook(s);
        return who === "both" || who === "customers";
    }).length;
    return onPage === services.length
        ? all
        : joinFacts(all, `${onPage} on your booking page`);
}

type LineService = Pick<
    Service,
    | "durationMinutes"
    | "capacity"
    | "locationType"
    | "priceCents"
    | "currency"
    | "gst"
> & {
    /** Visits one booking of it is (E10); absent reads as one. */
    visits?: number;
};

const WHERE: Record<Service["locationType"], string | null> = {
    IN_PERSON: null,
    ONLINE: "online",
    EITHER: "in person or online",
};

/**
 * A row's "how long · price · who": "45 min · ₹1,200 · Meera"; a class
 * "60 min · group class of 8 · ₹500 or a pack class · Neha"; a treatment
 * (E10) "4 visits of 60 min · …"; online "30 min · online · …". Who takes
 * it reads "nobody yet" when nobody does, and is left out when it
 * couldn't be read (`takers` null): the page says that once.
 */
export function serviceLine(
    s: LineService,
    takers: readonly string[] | null,
    currency: string,
): string {
    const visits = s.visits ?? 1;
    const isClass = s.capacity > 1;
    const price = s.priceCents
        ? setPriceWords(
              formatMoney(s.priceCents, s.currency ?? currency),
              s.gst,
          )
        : "Free";
    return joinFacts(
        visits > 1
            ? `${visits} visits of ${s.durationMinutes} min`
            : `${s.durationMinutes} min`,
        isClass ? `group class of ${s.capacity}` : null,
        WHERE[s.locationType],
        isClass && s.priceCents ? `${price} or a pack class` : price,
        takers === null
            ? null
            : takers.length
              ? takers.join(", ")
              : "nobody yet",
    );
}

/**
 * How a row is booked. On a phone "6 booked this week · 9 to come"; at the
 * desk, under "This week", "6 booked · 9 to come". "None booked" when both
 * are zero. A paused one says nobody can book it, and that what is still
 * to come happens. Null `usage` is a failed bookings read, said as such.
 */
export function weekLine(
    s: WhoFields,
    usage: ServiceUsage | null | undefined,
    size: "phone" | "desk",
): string {
    if (!isTaking(s)) {
        const n = usage?.comingUp ?? 0;
        return joinFacts(
            "Nobody can book it",
            n
                ? `${size === "phone" ? count(n, "booking") : n} still to come will happen`
                : null,
        );
    }
    if (!usage) return "Bookings couldn't be counted";
    if (!usage.thisWeek && !usage.comingUp) return "None booked";
    return joinFacts(
        `${usage.thisWeek} booked${size === "phone" ? " this week" : ""}`,
        `${usage.comingUp} to come`,
    );
}

/** Where someone goes to take bookings: Hours and time off. */
export const AVAILABILITY_HREF = "/bookings/availability";

export interface NobodyLine {
    line: string;
    link: { label: string; href: string };
}

/**
 * Said once above the list, in place of a line on every row: which
 * services nobody takes, and that they are booked in their own hours.
 * With nobody on the diary at all the way out is "Add who takes
 * bookings"; one service nobody takes opens to "Choose who"; several go
 * to Hours and time off to choose. Null when every service has someone.
 */
export function nobodyTakesLine(
    untaken: readonly Pick<Service, "id" | "name">[],
    total: number,
    anyoneOnDiary: boolean,
): NobodyLine | null {
    const n = untaken.length;
    const first = untaken.at(0);
    if (!first) return null;
    if (!anyoneOnDiary) {
        return {
            line:
                total === 1
                    ? "Nobody takes bookings yet, so it's booked in its own hours."
                    : "Nobody takes bookings yet, so each service is booked in its own hours.",
            link: { label: "Add who takes bookings", href: AVAILABILITY_HREF },
        };
    }
    return n === 1
        ? {
              line: `${first.name} has nobody to take it, so it's booked in its own hours.`,
              link: { label: "Choose who", href: `/services/${first.id}` },
          }
        : {
              line: `${count(n, "service")} have nobody to take ${plural(n, "it", "them")}, so they're booked in their own hours.`,
              link: { label: "Choose who", href: AVAILABILITY_HREF },
          };
}

/** The switch on a row and in the editor's header. */
export const TAKING_LABEL = "Taking bookings";

/** What the list's switch says it did, with Undo beside it (BA-29). */
export function pauseToast(name: string, taking: boolean): string {
    return taking
        ? `${name} is taking bookings again.`
        : `${name} paused. Nobody can book it, and bookings already made stay.`;
}

/** Past this many services the list offers a search. */
export const SEARCH_FROM = 9;
