import { Segmented } from "@saroh/ui/segmented";

/**
 * Bookings' two views of the same bookings: the calendar (`/bookings`) and
 * the list (`/bookings/all`). Links, not state, so each keeps its address:
 * a deep link and a booking's "All bookings" crumb still land on the list.
 */
export function BookingsViewSwitch({
    current,
}: {
    current: "calendar" | "list";
}) {
    return (
        <Segmented
            label="Bookings view"
            value={current}
            options={[
                { value: "calendar", href: "/bookings", label: "Calendar" },
                { value: "list", href: "/bookings/all", label: "List" },
            ]}
        />
    );
}
