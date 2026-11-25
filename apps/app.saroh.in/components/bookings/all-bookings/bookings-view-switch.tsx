import { Segmented } from "@saroh/ui/segmented";
import { CalendarDays, List } from "lucide-react";
import type { ReactNode } from "react";

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
    link,
    className,
}: {
    current: CalendarLayout;
    /** The day the calendar shows; left out, a layout opens on today. */
    date?: LocalDate;
    /** Cancelled bookings are drawn, and stay drawn in another layout. */
    cancelled?: boolean;
    /** The calendar's own address for a layout, when it keeps more. */
    hrefFor?: (layout: CalendarLayout) => string;
    /** A layout's `onNavigate`: on the calendar, the address changes in place. */
    link?: (href: string) => (e: { preventDefault: () => void }) => void;
    className?: string;
}) {
    const to = (layout: CalendarLayout) =>
        hrefFor ? hrefFor(layout) : calendarHref(layout, date, { cancelled });
    const option = (value: CalendarLayout, label: string) => ({
        value,
        href: to(value),
        label,
        onNavigate: link?.(to(value)),
    });
    return (
        <Segmented
            label="Show as"
            className={className}
            value={current}
            options={[
                option("day", "Day"),
                option("week", "Week"),
                option("agenda", "Agenda"),
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
    const phone = "max-[759px]:h-11 max-[759px]:flex-1 max-[759px]:text-[15px]";
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
                    icon: <CalendarDays />,
                    className: phone,
                },
                {
                    value: "list",
                    href: "/bookings/all",
                    label: "List",
                    icon: <List />,
                    className: phone,
                },
            ]}
        />
    );
}

/**
 * The first row of Bookings on a phone, the same on Calendar and List
 * (BKVListBPhone, BKVCalendarBPhone): Calendar | List across the width and
 * the view's "…" beside it, in the same place on both. It stays under the
 * app's bar as the page scrolls, so Day's move to now never hides it.
 */
export function BookingsPhoneBar({
    current,
    calendarTo,
    options,
}: {
    current: "calendar" | "list";
    calendarTo?: string;
    /** The view's "…" and its sheet. */
    options: ReactNode;
}) {
    return (
        <div
            data-bookings-bar=""
            className="sticky top-[61px] z-20 flex items-center gap-2 bg-background py-1.5"
        >
            <BookingsModeSwitch
                current={current}
                calendarTo={calendarTo}
                className="min-w-0 flex-1"
            />
            {options}
        </div>
    );
}
