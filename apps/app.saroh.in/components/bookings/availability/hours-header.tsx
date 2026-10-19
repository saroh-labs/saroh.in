import { PageHeader } from "@saroh/ui/page-header";

import { ReadOnlyNote } from "@/components/shared/read-only-note";

/** The page's line under its title (BKMAvailability, BKDHours). */
export const HOURS_LEAD =
    "When each person can be booked. Changes save as you make them, with Undo. Bookings already made never move.";

/**
 * Hours and time off's header (U17): the title and its one line, and — for
 * a role that can only read the hours (Calendar only) — one line saying so.
 */
export function HoursHeader({ readOnly }: { readOnly: boolean }) {
    return (
        <>
            <PageHeader
                breadcrumb={["Bookings", "Hours and time off"]}
                title="Hours and time off"
                description={HOURS_LEAD}
                holdsData={false}
            />
            {readOnly ? (
                <ReadOnlyNote>
                    Your role can see these hours but not change them.
                </ReadOnlyNote>
            ) : null}
        </>
    );
}
