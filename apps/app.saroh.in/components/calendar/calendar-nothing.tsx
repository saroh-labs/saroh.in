import { ModuleOffState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { CalendarDays } from "lucide-react";

import { AccessDenied } from "@/components/shared/access-denied";
import { whoCanChange } from "@/components/shared/who-can-change";

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
            <ModuleOffState
                icon={<CalendarDays />}
                name="Calendar"
                title="Nothing dated is turned on"
                description="The calendar lays out orders, renewals, invoices and bookings by day."
                canTurnOn={false}
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
    return <AccessDenied {...whoCanChange({ thing: "Calendar" })} />;
}
