"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { BusinessCalendar } from "@/components/calendar/business-calendar";
import { BusinessWeek } from "@/components/calendar/business-week";
import {
    CalendarLocked,
    CalendarNothing,
} from "@/components/calendar/calendar-nothing";
import { ScreenPending } from "@/components/shared/page/screen-pending";
import { calendarMonthPage, calendarWeekPage } from "@/lib/ask-ai/page-hints";
import type { CalendarNow } from "@/lib/calendar/queries";
import { calendarAt, openHref } from "@/lib/calendar/queries";
import { CalendarReadAgain, useCalendar } from "@/lib/calendar/use-calendar";
import { ReadFailed } from "@/lib/query/client";

type Can = React.ComponentProps<typeof BusinessWeek>["can"];

/**
 * The Business Calendar on React Query (DEC-259): the address is the key.
 * ‹ ›, This month and Month | Week stay links; they change the address in
 * place (`ScreenPending` `inPlace`), the month or week shown is read from
 * the calendar's query for the days it covers, and the last one stays,
 * greyed, until the new one arrives. Back opens the one before from the
 * cache. The first one too is read in the browser, behind the route's
 * loader (`skeleton`). The parts stay props-in.
 */
export function CalendarContainer({
    now,
    can,
    skeleton,
}: {
    /** Today and this month in the business's zone. */
    now: CalendarNow;
    can: Can;
    /** The route's loader, until the first month or week is read. */
    skeleton: ReactNode;
}) {
    const search = useSearchParams();
    const team = search.get("team") ?? undefined;
    const day = search.get("day") ?? undefined;
    const at = calendarAt(
        {
            view: search.get("view"),
            month: search.get("month"),
            day,
            team,
        },
        now,
    );
    const query = useCalendar(at.span);
    const read = query.data;
    // Out of reach (E21): the nearest the calendar reaches, already the key;
    // or the one the API named (E20).
    const moved =
        at.moved ??
        (read?.kind === "open"
            ? openHref(at.view, read.month, now, team)
            : null);
    useEffect(() => {
        if (moved) window.history.replaceState(null, "", moved);
    }, [moved]);

    // No business found is the nothing state; any other failure the
    // segment's failed state, as before.
    if (query.isError && !read) {
        if (query.error instanceof ReadFailed && query.error.status === 404) {
            return (
                <PageContainer width="full">
                    <CalendarNothing />
                </PageContainer>
            );
        }
        throw query.error;
    }
    if (read?.kind === "locked") return <CalendarLocked />;
    // Not read yet, or moving to the month the API named (E20).
    if (read?.kind !== "month") return skeleton;
    const data = read.data;
    const pending = query.isPlaceholderData;
    // What is drawn is what was read: while a switch of view is on its way,
    // the last month (or week) stays as it was, greyed.
    const view = data.days.length > 7 ? "month" : "week";

    return (
        <PageContainer width="full">
            <CalendarReadAgain.Provider value={() => void query.refetch()}>
                {view === "week" ? (
                    // What Ask AI offers on this week, counted from it (AF 2).
                    <AskAiPageIs page={calendarWeekPage(data, now.today)} />
                ) : (
                    <AskAiPageIs
                        page={calendarMonthPage(data.month, now.today)}
                    />
                )}
                <ScreenPending inPlace={{ pending }}>
                    {view === "week" ? (
                        <BusinessWeek
                            // A new week starts with its own day picked and
                            // every layer on.
                            key={data.days[0]?.date ?? now.today}
                            data={data}
                            today={now.today}
                            thisMonth={now.thisMonth}
                            can={can}
                            day={day}
                            team={team}
                        />
                    ) : (
                        <BusinessCalendar
                            // A new month starts with its own day picked and
                            // every layer on.
                            key={data.month}
                            data={data}
                            today={now.today}
                            thisMonth={now.thisMonth}
                            can={can}
                            // A key crossed into this month on this day (E28).
                            day={day}
                            team={team}
                        />
                    )}
                </ScreenPending>
            </CalendarReadAgain.Provider>
        </PageContainer>
    );
}
