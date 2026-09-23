import { BusinessCalendar } from "@/components/calendar/business-calendar";
import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { PageContainer } from "@/components/shared/page-container";
import { getCalendarMonth, monthNow, todayIn } from "@/lib/calendar/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Calendar" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Before the first read names the business's zone, the one it falls back to. */
const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Home › Calendar (U17, the "Saroh Business Calendar" design): one month of
 * everything dated — orders, collections, renewals, invoices, bookings and
 * classes — read from the records themselves; nothing is entered here.
 *
 * `?month=YYYY-MM` picks the month, so a month can be linked to. Without it,
 * this month in the business's own zone: the first read says which zone that
 * is, and on the rare hour the server's guess falls in a different month, the
 * page reads again rather than open on the wrong one.
 */
export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    await requireSession();
    const { month: asked } = await searchParams;
    const chosen =
        typeof asked === "string" && MONTH.test(asked) ? asked : null;

    let data = await getCalendarMonth(chosen ?? monthNow(FALLBACK_ZONE));
    if (data && !chosen && data.month !== monthNow(data.timezone)) {
        data = await getCalendarMonth(monthNow(data.timezone));
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
                />
            ) : (
                <CalendarNothing />
            )}
        </PageContainer>
    );
}
