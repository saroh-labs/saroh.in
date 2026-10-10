import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";

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
    const views = [
        { id: "calendar", href: "/bookings", label: "Calendar" },
        { id: "list", href: "/bookings/all", label: "List" },
    ] as const;
    return (
        <nav aria-label="Bookings view" className={cn("flex", SEGMENTED)}>
            {views.map((v) => (
                <Link
                    key={v.id}
                    href={v.href}
                    aria-current={current === v.id ? "page" : undefined}
                    data-state={current === v.id ? "on" : "off"}
                    className={cn(
                        "inline-flex items-center rounded-md",
                        SEGMENT,
                    )}
                >
                    {v.label}
                </Link>
            ))}
        </nav>
    );
}
