import { redirect } from "next/navigation";

import { BusinessCalendar } from "@/components/calendar/business-calendar";
import { BusinessWeek } from "@/components/calendar/business-week";
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
import {
    getCalendarMonth,
    getCalendarWeek,
    monthNow,
    todayIn,
} from "@/lib/calendar/service";
import { clampWeekDay, isDay, weekHref } from "@/lib/calendar/week";
import { orderPowers } from "@/lib/orders/access";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Calendar" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Before the first read names the business's zone, the one it falls back to. */
const FALLBACK_ZONE = "Asia/Kolkata";

type Can = React.ComponentProps<typeof BusinessCalendar>["can"];

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
 * calendar reaches (E21): the API refuses it and names that month (E20).
 * `?day=YYYY-MM-DD` opens it on that day: a key in the grid that moves past
 * the month's edge asks for it (E28). `?team=<staff id>` opens it on one
 * person's bookings and classes (E24), for a viewer the team is named to.
 * `?view=week` opens the Week (E25) holding `?day=`, or this week: Monday
 * to Sunday in one read, pulled inside the range the same way.
 *
 * A role that reads none of the layers is told so before anything is read,
 * and again if the API refuses it (E20's 403).
 */
export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<{
        month?: string;
        day?: string;
        team?: string;
        view?: string;
    }>;
}) {
    await requireSession();
    const [{ month: asked, day, team, view }, organization] = await Promise.all(
        [searchParams, resolveActiveOrganization()],
    );
    if (calendarLocked(organization?.actions)) return <CalendarLocked />;

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const can: Can = {
        // New order: `order:create` (B16).
        order: orderPowers(organization).create,
        book: may("booking:write"),
        // A named problem's fix (E22): offered only to whoever may make it.
        remind: may("invoice:write"),
        retry: may("subscription:write"),
    };
    // The team filter's person (E24); one the filter doesn't list opens on
    // Everyone.
    const person = typeof team === "string" ? team : undefined;

    if (view === "week") {
        return (
            <CalendarWeek
                day={isDay(day) ? day : null}
                team={person}
                can={can}
            />
        );
    }

    const chosen =
        typeof asked === "string" && MONTH.test(asked) ? asked : null;

    let read = await getCalendarMonth(chosen ?? monthNow(FALLBACK_ZONE));
    if (
        read?.kind === "month" &&
        !chosen &&
        read.data.month !== monthNow(read.data.timezone)
    ) {
        read = await getCalendarMonth(monthNow(read.data.timezone));
    }
    if (read?.kind === "locked") return <CalendarLocked />;
    // Out of reach (E20): the API names the month to open — the joined one,
    // or the last that can be planned — so open it rather than fail.
    if (read?.kind === "open") {
        redirect(
            read.month === monthNow(FALLBACK_ZONE)
                ? "/calendar"
                : `/calendar?month=${read.month}`,
        );
    }
    const data = read?.kind === "month" ? read.data : null;

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
                    can={can}
                    // A key crossed into this month on this day (E28).
                    day={typeof day === "string" ? day : undefined}
                    team={person}
                />
            ) : (
                <CalendarNothing />
            )}
        </PageContainer>
    );
}

/**
 * The Week (E25): the week holding `day`, or this week in the business's
 * zone. As with a month, the first read names the zone, and a week out of
 * reach opens the nearest one the calendar reaches.
 */
async function CalendarWeek({
    day,
    team,
    can,
}: {
    day: string | null;
    team: string | undefined;
    can: Can;
}) {
    const open = (to: string) =>
        // `today: ""` keeps the day in the address whatever it is.
        redirect(weekHref({ day: to, today: "", team }));

    let read = await getCalendarWeek(day ?? todayIn(FALLBACK_ZONE));
    if (
        read?.kind === "month" &&
        !day &&
        todayIn(read.data.timezone) !== todayIn(FALLBACK_ZONE)
    ) {
        read = await getCalendarWeek(todayIn(read.data.timezone));
    }
    if (read?.kind === "locked") return <CalendarLocked />;
    // Wholly out of reach (E20): the API names the month to open. Its 1st
    // is read, and pulled inside the joined day below if need be.
    if (read?.kind === "open") open(`${read.month}-01`);
    const data = read?.kind === "month" ? read.data : null;
    if (!data) {
        return (
            <PageContainer width="full">
                <CalendarNothing />
            </PageContainer>
        );
    }

    const today = todayIn(data.timezone);
    const thisMonth = monthNow(data.timezone);
    if (day) {
        const reached = clampWeekDay(
            day,
            calendarRange(data.joinedAt, thisMonth),
        );
        if (reached !== day) open(reached);
    }

    return (
        <PageContainer width="full">
            <BusinessWeek
                // A new week starts with its own day picked and every layer
                // on.
                key={data.days[0]?.date ?? today}
                data={data}
                today={today}
                thisMonth={thisMonth}
                can={can}
                day={day ?? undefined}
                team={team}
            />
        </PageContainer>
    );
}
