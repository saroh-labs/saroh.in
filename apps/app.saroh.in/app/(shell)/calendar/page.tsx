import { redirect } from "next/navigation";

import { BusinessCalendar } from "@/components/calendar/business-calendar";
import {
    CalendarLocked,
    CalendarNothing,
} from "@/components/calendar/calendar-nothing";
import { PageContainer } from "@/components/shared/page-container";
import {
    calendarLocked,
    calendarRange,
    clampMonth,
} from "@/lib/calendar/range";
import { getCalendarMonth, monthNow, todayIn } from "@/lib/calendar/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Calendar" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Before the first read names the business's zone, the one it falls back to. */
const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Home › Calendar (U17, the "Saroh Business Calendar" design): one month of
 * everything dated — orders, pick-ups, renewals, invoices, bookings and
 * classes — read from the records themselves; nothing is entered here.
 *
 * `?month=YYYY-MM` picks the month, so a month can be linked to. Without it,
 * this month in the business's own zone: the first read says which zone that
 * is, and on the rare hour the server's guess falls in a different month, the
 * page reads again rather than open on the wrong one. A month before the
 * business joined, or past what can be planned, opens the nearest one the
 * calendar reaches (E21). `?day=YYYY-MM-DD` opens it on that day: a key in
 * the grid that moves past the month's edge asks for it (E28).
 *
 * A role that reads none of the layers is told so before anything is read.
 */
export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; day?: string }>;
}) {
    await requireSession();
    const [{ month: asked, day }, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    if (calendarLocked(organization?.actions)) return <CalendarLocked />;

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    const chosen =
        typeof asked === "string" && MONTH.test(asked) ? asked : null;

    let data = await getCalendarMonth(chosen ?? monthNow(FALLBACK_ZONE));
    if (data && !chosen && data.month !== monthNow(data.timezone)) {
        data = await getCalendarMonth(monthNow(data.timezone));
    }

    if (data && chosen) {
        const thisMonth = monthNow(data.timezone);
        const reached = clampMonth(
            chosen,
            calendarRange(data.joinedAt, thisMonth),
        );
        if (reached !== chosen) {
            redirect(
                reached === thisMonth
                    ? "/calendar"
                    : `/calendar?month=${reached}`,
            );
        }
    }

    return (
        <PageContainer width="full">
            {data ? (
                <BusinessCalendar
                    // A new month starts with its own day picked and every
                    // layer on.
                    key={data.month}
                    data={data}
                    today={todayIn(data.timezone)}
                    thisMonth={monthNow(data.timezone)}
                    can={{
                        order: may("order:write"),
                        book: may("booking:write"),
                    }}
                    // A key crossed into this month on this day (E28).
                    day={typeof day === "string" ? day : undefined}
                />
            ) : (
                <CalendarNothing />
            )}
        </PageContainer>
    );
}
