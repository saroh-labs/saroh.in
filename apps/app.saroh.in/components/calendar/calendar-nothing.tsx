import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { CalendarDays } from "lucide-react";

/**
 * A business with nothing the calendar can lay out for this person: none of
 * Sell, Payments or Bookings is on, or their role reads none of them. Said as
 * what the calendar would show, not as "no events yet" — nothing was looked
 * for.
 */
export function CalendarNothing() {
    return (
        <>
            <PageHeader breadcrumb={["Home", "Calendar"]} title="Calendar" />
            <EmptyState
                icon={<CalendarDays aria-hidden />}
                title="Nothing dated to show here"
                description="The calendar lays out orders, subscription renewals, invoices and bookings by day. None of them is turned on for this business, or open to your role."
            />
        </>
    );
}
