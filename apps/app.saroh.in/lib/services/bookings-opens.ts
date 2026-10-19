import type { CalendarLayout } from "./calendar-href";

/**
 * Where Bookings opens (DEC-170, Q15 option C and the desktop answers of 19
 * Oct): which view, and whose bookings. Pure, so the server page and the
 * header's "…" sheet share one reading of it.
 *
 * - **Start Bookings on**: "Where I left it" (the default: the view last
 *   used on this phone or computer, kept in a cookie) or a fixed Day, Week
 *   or List, kept for the person.
 * - **Show bookings for**: "The last person I picked" (the default:
 *   Everyone until they pick someone), Everyone, or Just me.
 *
 * What the person chooses is kept by the API as their one saved view of
 * `bookings.calendar` (`PUT saved-views`): theirs, in this business, on
 * every device. An address that names a view or a person always wins.
 */

/** "Start Bookings on". `list` is the agenda (Q4). */
export type StartView = "last" | "day" | "week" | "list";
/** "Show bookings for". */
export type ShowFor = "last" | "all" | "me";

export interface BookingsOpens {
    start: StartView;
    showFor: ShowFor;
    /** The staff member last picked in Whose bookings, or null (Everyone). */
    lastPerson: string | null;
}

export const OPENS_DEFAULT: BookingsOpens = {
    start: "last",
    showFor: "last",
    lastPerson: null,
};

/** The saved view these are kept as. */
export const OPENS_RESOURCE = "bookings.calendar";
export const OPENS_NAME = "opens on";

/** The cookie that keeps the view last used on this device. */
export const LAST_VIEW_COOKIE = "saroh_bookings_view";

/** The address's `person` for everyone's bookings. */
export const EVERYONE = "all";

const STARTS: readonly StartView[] = ["last", "day", "week", "list"];
const SHOWS: readonly ShowFor[] = ["last", "all", "me"];

/**
 * What the API kept, narrowed field by field: anything unknown reads as the
 * default, never as an error, so an old or odd record still opens Bookings.
 */
export function readOpens(filters: unknown): BookingsOpens {
    const f =
        filters && typeof filters === "object"
            ? (filters as Record<string, unknown>)
            : {};
    const start = STARTS.find((s) => s === f.start) ?? OPENS_DEFAULT.start;
    const showFor = SHOWS.find((s) => s === f.showFor) ?? OPENS_DEFAULT.showFor;
    const lastPerson =
        typeof f.lastPerson === "string" &&
        f.lastPerson.length > 0 &&
        f.lastPerson.length <= 64
            ? f.lastPerson
            : null;
    return { start, showFor, lastPerson };
}

/** The address's layout for a view's name: List is the agenda (Q4). */
export function layoutOfView(view: "day" | "week" | "list"): CalendarLayout {
    return view === "list" ? "agenda" : view;
}

/** A layout read from anywhere (the address, the cookie), or null. */
export function layoutOf(value: unknown): CalendarLayout | null {
    return value === "day" || value === "week" || value === "agenda"
        ? value
        : null;
}

/**
 * The view Bookings opens on: the one the address names; else the
 * person's fixed choice; else the one last used on this device; else Day.
 */
export function openingLayout({
    asked,
    start,
    lastUsed,
}: {
    asked: unknown;
    start: StartView;
    lastUsed: unknown;
}): CalendarLayout {
    return (
        layoutOf(asked) ??
        (start === "last" ? null : layoutOfView(start)) ??
        layoutOf(lastUsed) ??
        "day"
    );
}

/**
 * Whose bookings it opens on, as the address's `person`: the one the
 * address names (when they are among `people`); else Everyone, the person
 * themselves (Just me, when they take bookings) or their last pick (when
 * still among `people`). Everyone is `EVERYONE`.
 */
export function openingPerson({
    asked,
    opens,
    people,
    me,
}: {
    asked: unknown;
    opens: BookingsOpens;
    /** The ids someone may be shown for: the people on the diary. */
    people: readonly string[];
    /** The viewer's own staff id, when they take bookings. */
    me: string | null;
}): string {
    const known = (id: unknown): id is string =>
        typeof id === "string" && people.includes(id);
    if (asked === EVERYONE) return EVERYONE;
    if (known(asked)) return asked;
    if (opens.showFor === "all") return EVERYONE;
    if (opens.showFor === "me") return known(me) ? me : EVERYONE;
    return known(opens.lastPerson) ? opens.lastPerson : EVERYONE;
}

/**
 * Keep the view just used on this device, for "Where I left it". A
 * year-long cookie the server page reads, so Bookings opens on it with no
 * flash. Storage that refuses leaves Day as the start, nothing worse.
 */
export function rememberLastView(layout: CalendarLayout): void {
    try {
        document.cookie = `${LAST_VIEW_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
    } catch {
        // Cookies blocked: Bookings opens on Day here, as it always did.
    }
}
