import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { CalendarContainer } from "@/components/calendar/calendar-container";
import {
    CalendarLocked,
    CalendarNothing,
} from "@/components/calendar/calendar-nothing";
import { PageContainer } from "@/components/shared/page/page-container";
import { calendarCan, calendarServer, lockedFor } from "@/lib/calendar/access";
import type { CalendarAsk, CalendarNow } from "@/lib/calendar/queries";
import { calendarAt, calendarRead, openHref } from "@/lib/calendar/queries";
import { monthNow, todayIn } from "@/lib/calendar/service";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { ReadFailed } from "@/lib/query/client";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Business calendar" };

/** Before the first read names the business's zone, the one it falls back to. */
const FALLBACK_ZONE = DEFAULT_BUSINESS_ZONE;

const nowIn = (zone: string, joinedAt?: string | null): CalendarNow => ({
    today: todayIn(zone),
    thisMonth: monthNow(zone),
    joinedAt,
});

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
 * On React Query (DEC-259): the gates are awaited here, the first month or
 * week is prefetched and hydrated, and the container reads every later one
 * from the address in place (`calendar-container.tsx`).
 *
 * A role that reads none of the layers is told so before anything is read,
 * and again if the API refuses it (E20's 403).
 */
export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [params, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    // A repeated param is no pick, as the browser's `get` would take the first.
    const one = (v: string | string[] | undefined) =>
        typeof v === "string" ? v : undefined;
    const ask: CalendarAsk = {
        view: one(params.view),
        month: one(params.month),
        day: one(params.day),
        team: one(params.team),
    };
    if (lockedFor(organization)) return <CalendarLocked />;
    if (!organization) return nothing();
    const orgId = organization.id;
    const can = calendarCan(organization);

    const client = getServerQueryClient();
    const readAt = async (now: CalendarNow) => {
        const { span } = calendarAt(ask, now);
        await prefetchRead(client, calendarServer, orgId, span);
        return {
            span,
            read: client.getQueryData(
                calendarRead.options(orgId, span).queryKey,
            ),
        };
    };

    const guess = nowIn(FALLBACK_ZONE);
    let { span, read } = await readAt(guess);
    // Today in the business's own zone, when the guess named another month
    // (or day, for a week) and the address didn't pick one.
    if (read?.kind === "month") {
        const real = nowIn(read.data.timezone);
        const unpicked = !calendarAt(ask, guess).picked;
        const off =
            ask.view === "week"
                ? real.today !== guess.today
                : real.thisMonth !== guess.thisMonth;
        if (unpicked && off) {
            client.removeQueries({ queryKey: calendarRead.key(orgId, span) });
            ({ span, read } = await readAt(real));
        }
    }

    if (!read) {
        const error = client.getQueryState(
            calendarRead.key(orgId, span),
        )?.error;
        // No business found is the nothing state; any other failure the
        // segment's failed state, as before.
        if (error instanceof ReadFailed && error.status === 404)
            return nothing();
        throw error ?? new Error("The calendar couldn't be read");
    }
    if (read.kind === "locked") return <CalendarLocked />;
    const view = ask.view === "week" ? "week" : "month";
    // Out of reach (E20): the API names the month to open — the joined one,
    // or the last that can be planned — so open it rather than fail.
    if (read.kind === "open") {
        redirect(openHref(view, read.month, guess, ask.team));
    }

    const now = nowIn(read.data.timezone, read.data.joinedAt);
    const { moved } = calendarAt(ask, now);
    if (moved) redirect(moved);

    return (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                <CalendarContainer now={now} can={can} />
            </HydrationBoundary>
        </PageContainer>
    );
}

function nothing() {
    return (
        <PageContainer width="full">
            <CalendarNothing />
        </PageContainer>
    );
}
