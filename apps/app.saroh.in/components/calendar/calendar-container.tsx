"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { Skeleton } from "@saroh/ui/skeleton";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { BusinessCalendar } from "@/components/calendar/business-calendar";
import { BusinessWeek } from "@/components/calendar/business-week";
import {
    CalendarLocked,
    CalendarNothing,
} from "@/components/calendar/calendar-nothing";
import { MonthToolbar } from "@/components/calendar/month-toolbar";
import { PageLoading } from "@/components/shared/page/page-loading";
import { ScreenPending } from "@/components/shared/page/screen-pending";
import { calendarMonthPage, calendarWeekPage } from "@/lib/ask-ai/page-hints";
import { monthTitle, shiftMonth } from "@/lib/calendar/layers";
import type { CalendarAt, CalendarNow } from "@/lib/calendar/queries";
import { calendarAt, openHref } from "@/lib/calendar/queries";
import { calendarHref } from "@/lib/calendar/team";
import { CalendarReadAgain, useCalendar } from "@/lib/calendar/use-calendar";
import { addDays, isThisWeek, weekHref, weekTitle } from "@/lib/calendar/week";
import { ReadFailed } from "@/lib/query/client";

type Can = React.ComponentProps<typeof BusinessWeek>["can"];

/**
 * The Business Calendar on React Query (DEC-259): the address is the key.
 * ‹ ›, This month and Month | Week stay links; they change the address in
 * place (`ScreenPending` `inPlace`), the month or week shown is read from
 * the calendar's query for the days it covers, and the last one stays,
 * greyed, until the new one arrives. Back opens the one before from the
 * cache. The first one too is read in the browser: until it lands the
 * toolbar is drawn at once from the address (‹ ›, This month, Month | Week,
 * all working) and the grid is the route loader's calendar shape; What to
 * show, which lists what the business has, waits as a bar (owner, 25 Nov).
 * The parts stay props-in.
 */
export function CalendarContainer({
    now,
    can,
}: {
    /** Today and this month in the business's zone. */
    now: CalendarNow;
    can: Can;
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
    if (read?.kind !== "month") {
        return (
            <PageContainer width="full">
                <ScreenPending inPlace={{ pending: false }}>
                    <CalendarReading at={at} now={now} team={team} />
                </ScreenPending>
            </PageContainer>
        );
    }
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

/**
 * The Calendar before its first read: the toolbar as the address asks for
 * it, and the grid's shape. The edges of what the calendar reaches come with
 * the read, so ‹ › aren't stopped yet; a month out of reach is moved by the
 * read (E20).
 */
function CalendarReading({
    at,
    now,
    team,
}: {
    at: CalendarAt;
    now: CalendarNow;
    team?: string;
}) {
    const filter = (
        <Skeleton aria-hidden className="h-8 w-[132px] max-[759px]:w-full" />
    );
    let toolbar: React.ReactNode;
    if (at.view === "week") {
        const from = at.span.from;
        const href = (day: string) => weekHref({ day, today: now.today, team });
        toolbar = (
            <MonthToolbar
                title={weekTitle(from, now.today)}
                prev={{
                    href: href(addDays(from, -7)),
                    label: "Previous week",
                    edge: null,
                }}
                next={{
                    href: href(addDays(from, 7)),
                    label: "Next week",
                    edge: null,
                }}
                current={{
                    label: "This week",
                    href: href(now.today),
                    here: isThisWeek(from, now.today),
                }}
                view={{
                    value: "week",
                    hrefs: {
                        month: calendarHref({
                            month: from.slice(0, 7),
                            thisMonth: now.thisMonth,
                            team,
                        }),
                        week: href(from),
                    },
                }}
                filter={filter}
            />
        );
    } else {
        const month = at.span.from.slice(0, 7);
        const href = (m: string) =>
            calendarHref({ month: m, thisMonth: now.thisMonth, team });
        toolbar = (
            <MonthToolbar
                title={monthTitle(month)}
                prev={{
                    href: href(shiftMonth(month, -1)),
                    label: "Previous month",
                    edge: null,
                }}
                next={{
                    href: href(shiftMonth(month, 1)),
                    label: "Next month",
                    edge: null,
                }}
                current={{
                    label: "This month",
                    href: href(now.thisMonth),
                    here: month === now.thisMonth,
                }}
                view={{
                    value: "month",
                    hrefs: {
                        month: href(month),
                        week: weekHref({
                            day:
                                month === now.thisMonth
                                    ? now.today
                                    : `${month}-01`,
                            today: now.today,
                            team,
                        }),
                    },
                }}
                filter={filter}
            />
        );
    }
    return (
        <>
            {toolbar}
            <div className="!mt-3.5">
                <PageLoading
                    bare
                    width="full"
                    shape="calendar"
                    label="Loading the calendar"
                />
            </div>
        </>
    );
}
