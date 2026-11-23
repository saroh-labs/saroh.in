import type { LocalDate } from "./diary";

export type CalendarLayout = "day" | "week" | "agenda";

/** The Google layer in What to show (BKVGoogle): the address's `google=`. */
export type GoogleShow = "all" | "mine" | "off";

/**
 * The Bookings calendar's address for a layout and a day. Without a day it
 * is the layout on today. The layout is always written, Day too: an
 * address with none opens where the person starts Bookings (DEC-170), so a
 * link to the day must say so. `person` keeps whose bookings are shown (a
 * staff id, or `all` for everyone), and `cancelled` keeps cancelled
 * bookings drawn, so a reload and the next day both remember them.
 */
export function calendarHref(
    layout: CalendarLayout,
    date?: LocalDate | null,
    {
        cancelled = false,
        person = null,
        google = "all",
    }: {
        cancelled?: boolean;
        person?: string | null;
        /** The Google layer: everyone's busy times (the default), just mine, or none. */
        google?: GoogleShow;
    } = {},
) {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    q.set("layout", layout);
    if (person) q.set("person", person);
    if (cancelled) q.set("cancelled", "1");
    if (google !== "all") q.set("google", google === "off" ? "0" : google);
    return `/bookings?${q.toString()}`;
}
