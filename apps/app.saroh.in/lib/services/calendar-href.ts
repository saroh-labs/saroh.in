import type { LocalDate } from "./diary";

export type CalendarLayout = "day" | "week" | "agenda";

/**
 * The Bookings calendar's address for a layout and a day. Without a day it
 * is the layout on today. `cancelled` keeps cancelled bookings drawn, so a
 * reload and the next day both remember the choice.
 */
export function calendarHref(
    layout: CalendarLayout,
    date?: LocalDate | null,
    { cancelled = false }: { cancelled?: boolean } = {},
) {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (layout !== "day") q.set("layout", layout);
    if (cancelled) q.set("cancelled", "1");
    const query = q.toString();
    return query ? `/bookings?${query}` : "/bookings";
}
