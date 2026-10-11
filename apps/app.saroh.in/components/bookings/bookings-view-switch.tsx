import { Segmented } from "@saroh/ui/segmented";

import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";

/** A view of the bookings: one of the calendar's layouts, or the list. */
export type BookingsView = CalendarLayout | "list";

/**
 * The one switch between the views of the same bookings: the calendar by
 * day, by week or as an agenda (`/bookings`), and the list
 * (`/bookings/all`). It used to be two switches side by side, Calendar |
 * List and then the layout; the list is the fourth view, so it is one.
 *
 * Links, not state, so each view keeps its address: a deep link and a
 * booking's "All bookings" crumb still land on the list. From the calendar
 * the layouts keep the day shown and whether cancelled bookings are drawn.
 */
export function BookingsViewSwitch({
    current,
    date,
    cancelled = false,
    className,
}: {
    current: BookingsView;
    /** The day the calendar shows; left out, a layout opens on today. */
    date?: LocalDate;
    /** Cancelled bookings are drawn, and stay drawn in another layout. */
    cancelled?: boolean;
    className?: string;
}) {
    const to = (layout: CalendarLayout) =>
        calendarHref(layout, date, { cancelled });
    return (
        <Segmented
            label="Bookings view"
            className={className}
            value={current}
            options={[
                {
                    value: "day",
                    href: to("day"),
                    label: (
                        <>
                            <span className="max-[759px]:hidden">
                                Day by person
                            </span>
                            <span className="min-[760px]:hidden">Day</span>
                        </>
                    ),
                },
                {
                    value: "week",
                    href: to("week"),
                    label: "Week",
                    // A phone has no week grid.
                    className: "max-[759px]:hidden",
                },
                { value: "agenda", href: to("agenda"), label: "Agenda" },
                { value: "list", href: "/bookings/all", label: "List" },
            ]}
        />
    );
}
