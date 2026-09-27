import type { LocalDate } from "./diary";

export type CalendarLayout = "day" | "week" | "agenda";

/** The Bookings calendar's address for a layout and a day. */
export function calendarHref(layout: CalendarLayout, date: LocalDate) {
    const q = new URLSearchParams({ date });
    if (layout !== "day") q.set("layout", layout);
    return `/bookings?${q.toString()}`;
}
