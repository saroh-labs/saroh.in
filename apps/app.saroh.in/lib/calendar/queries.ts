import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import { calendarRange, clampMonth, monthSpan } from "./range";
import type { CalendarRead } from "./service";
import { calendarHref } from "./team";
import { clampWeekDay, isDay, weekHref, weekSpan } from "./week";

/**
 * The Business Calendar's read (DEC-259). Client-safe: the key, the route
 * and how an address becomes the days read; the service is paired in
 * `access.ts`.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Every calendar read of a business: what a booking save marks stale. */
export const calendarKeys = (orgId: string): DomainKey =>
    domainKey("calendar", orgId);

/** The days read, both inclusive: a month or a Monday-to-Sunday week. */
export interface CalendarSpan {
    from: string;
    to: string;
}

/** A month or a week: one read, keyed on the days it covers. */
export const calendarRead = defineRead<CalendarRead>()({
    key: (orgId, span) => domainKey("calendar", orgId, "range", span),
    route: { path: "/api/calendar", params: { from: day, to: day } },
    tier: "live",
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** What the calendar's address asks for (`?view`, `?month`, `?day`, `?team`). */
export interface CalendarAsk {
    view?: string | null;
    month?: string | null;
    day?: string | null;
    team?: string | null;
}

/** Now in the business's zone, and its back edge once read. */
export interface CalendarNow {
    today: string;
    thisMonth: string;
    joinedAt?: string | null;
}

export interface CalendarAt {
    view: "month" | "week";
    /** The days to read: the asked ones pulled inside the range. */
    span: CalendarSpan;
    /** Whether the address picked the month or day, rather than now. */
    picked: boolean;
    /** The address to open instead when the asked one was out of reach. */
    moved: string | null;
}

/**
 * The address as a read, on the page and in the browser alike: a month
 * (`?month=`, else this one) or the week holding `?day=` (else today),
 * pulled inside what the calendar reaches (E21). Pure.
 */
export function calendarAt(ask: CalendarAsk, now: CalendarNow): CalendarAt {
    const range = calendarRange(now.joinedAt, now.thisMonth);
    if (ask.view === "week") {
        const asked = isDay(ask.day) ? ask.day : null;
        const reached = asked ? clampWeekDay(asked, range) : now.today;
        return {
            view: "week",
            span: weekSpan(reached),
            picked: !!asked,
            moved:
                asked && reached !== asked
                    ? // `today: ""` keeps the day in the address whatever it is.
                      weekHref({ day: reached, today: "", team: ask.team })
                    : null,
        };
    }
    const asked = ask.month && MONTH.test(ask.month) ? ask.month : null;
    const reached = asked ? clampMonth(asked, range) : now.thisMonth;
    return {
        view: "month",
        span: monthSpan(reached),
        picked: !!asked,
        moved:
            asked && reached !== asked
                ? calendarHref({ month: reached, thisMonth: now.thisMonth })
                : null,
    };
}

/**
 * Where the API's "out of reach" answer (E20) sends this view: the month
 * it names, or for a week that month's 1st.
 */
export function openHref(
    view: CalendarAt["view"],
    month: string,
    now: CalendarNow,
    team?: string | null,
): string {
    return view === "week"
        ? weekHref({ day: `${month}-01`, today: "", team })
        : calendarHref({ month, thisMonth: now.thisMonth });
}
