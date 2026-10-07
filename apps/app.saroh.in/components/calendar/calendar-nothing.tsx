import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { CalendarDays } from "lucide-react";

import { AccessDenied } from "@/components/shared/access-denied";

/**
 * A business with nothing the calendar can lay out for this person: none of
 * Sell, Payments or Bookings is on, or the layers their role reads belong to
 * modules that are off. Said as what the calendar would show, not as "no
 * events yet" — nothing was looked for. A role that reads none of them at all
 * sees {@link CalendarLocked} instead.
 */
export function CalendarNothing() {
    return (
        <>
            <PageHeader breadcrumb={["Home", "Overview"]} title="Overview" />
            <EmptyState
                icon={<CalendarDays aria-hidden />}
                title="Nothing dated to show here"
                description="The calendar lays out orders, subscription renewals, invoices and bookings by day. None of them is turned on for this business, or open to your role."
            />
        </>
    );
}

/**
 * A role that reads none of orders, bookings, subscriptions or invoices, after
 * the design's locked state (E21): why, who can change it, and the way home.
 * No retry — nothing failed.
 */
export function CalendarLocked() {
    return (
        <AccessDenied
            title="You can't open the calendar"
            description="Your role can't see orders, bookings, subscriptions or invoices, so there's nothing to show. An owner can give you access in Team."
            note={null}
            backLabel="Back to Home"
        />
    );
}
