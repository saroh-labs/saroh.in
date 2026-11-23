import { Segmented } from "@saroh/ui/segmented";

import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";

/**
 * "Show as" in the calendar's date sheet: Day, Week or Agenda (the one-day
 * list of times, called List until the register took that name).
 *
 * Links, not state, so each layout keeps its address. From the calendar
 * the layouts keep the day shown, whose bookings, and whether cancelled
 * bookings are drawn (`hrefFor`).
 */
export function BookingsViewSwitch({
    current,
    date,
    cancelled = false,
    hrefFor,
    className,
}: {
    current: CalendarLayout;
    /** The day the calendar shows; left out, a layout opens on today. */
    date?: LocalDate;
    /** Cancelled bookings are drawn, and stay drawn in another layout. */
    cancelled?: boolean;
    /** The calendar's own address for a layout, when it keeps more. */
    hrefFor?: (layout: CalendarLayout) => string;
    className?: string;
}) {
    const to = (layout: CalendarLayout) =>
        hrefFor ? hrefFor(layout) : calendarHref(layout, date, { cancelled });
    return (
        <Segmented
            label="Show as"
            className={className}
            value={current}
            options={[
                { value: "day", href: to("day"), label: "Day" },
                { value: "week", href: to("week"), label: "Week" },
                { value: "agenda", href: to("agenda"), label: "Agenda" },
            ]}
        />
    );
}

/**
 * Calendar | List, in the header of both Bookings views: Calendar is the
 * day, week or agenda (where it was left), List is the register of every
 * booking (`/bookings/all`). Two addresses, so a deep link and the back
 * button work. On a phone it is full width, 44px options.
 */
export function BookingsModeSwitch({
    current,
    calendarTo,
    className,
}: {
    current: "calendar" | "list";
    /** The calendar's own address, keeping its day and person. */
    calendarTo?: string;
    className?: string;
}) {
    return (
        <Segmented
            label="Bookings"
            size="md"
            className={`max-[759px]:w-full ${className ?? ""}`}
            value={current}
            options={[
                {
                    value: "calendar",
                    // From List the Calendar always opens the calendar, not
                    // "Where I left it" (which may be List).
                    href:
                        calendarTo ??
                        (current === "list"
                            ? "/bookings?calendar=1"
                            : "/bookings"),
                    label: "Calendar",
                    className: "max-[759px]:flex-1",
                },
                {
                    value: "list",
                    href: "/bookings/all",
                    label: "List",
                    className: "max-[759px]:flex-1",
                },
            ]}
        />
    );
}
