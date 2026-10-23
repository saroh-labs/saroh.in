import { Segmented } from "@saroh/ui/segmented";

import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";

/**
 * A view of the bookings: one of the calendar's layouts, or the list of
 * all bookings (`/bookings/all`, "list" in the address of this switch).
 */
export type BookingsView = CalendarLayout | "list";

/**
 * The views of the same bookings: the calendar by day, by week or as a list
 * of the day (the agenda, called List since header C, Q4), and All bookings
 * (`/bookings/all`). On the calendar it is "Show as" in the date sheet and
 * offers the three layouts alone (`withAll={false}`); All bookings is in the
 * "…" sheet there. All bookings' own page still carries all four.
 *
 * Links, not state, so each view keeps its address: a deep link and a
 * booking's "All bookings" crumb still land on the list. From the calendar
 * the layouts keep the day shown, whose bookings, and whether cancelled
 * bookings are drawn (`hrefFor`).
 */
export function BookingsViewSwitch({
    current,
    date,
    cancelled = false,
    hrefFor,
    withAll = true,
    className,
}: {
    current: BookingsView;
    /** The day the calendar shows; left out, a layout opens on today. */
    date?: LocalDate;
    /** Cancelled bookings are drawn, and stay drawn in another layout. */
    cancelled?: boolean;
    /** The calendar's own address for a layout, when it keeps more. */
    hrefFor?: (layout: CalendarLayout) => string;
    /** Offer All bookings as the fourth view. */
    withAll?: boolean;
    className?: string;
}) {
    const to = (layout: CalendarLayout) =>
        hrefFor ? hrefFor(layout) : calendarHref(layout, date, { cancelled });
    return (
        <Segmented
            label="Bookings view"
            className={className}
            value={current}
            options={[
                { value: "day", href: to("day"), label: "Day" },
                { value: "week", href: to("week"), label: "Week" },
                { value: "agenda", href: to("agenda"), label: "List" },
                ...(withAll
                    ? [
                          {
                              value: "list" as const,
                              href: "/bookings/all",
                              label: "All bookings",
                          },
                      ]
                    : []),
            ]}
        />
    );
}
