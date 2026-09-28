import { ApiError } from "@/lib/api/errors";
import { apiFetch, orgBase } from "@/lib/api/http";
import { localDateKey } from "@/lib/format/datetime";

import { monthSpan, monthToOpen } from "./range";
import type { CalendarMonth } from "./types";
import { weekSpan } from "./week";

/**
 * What reading a month came to:
 * - `month`: the month, every day with every layer this viewer may see;
 * - `open`: the month lies outside what the calendar reaches (before the
 *   business joined, or past three months ahead), and the API named the
 *   one to open instead (E20) — never an error page;
 * - `locked`: this role reads none of the layers (E20's 403).
 */
export type CalendarRead =
    | { kind: "month"; data: CalendarMonth }
    | { kind: "open"; month: string }
    | { kind: "locked" };

/**
 * The Business Calendar's month (`GET organizations/:org/calendar`, asked
 * as E20's `from`/`to`): every day of the month with every layer this viewer
 * may see, what needs acting on, the takings (money roles only) and the
 * layers that could not be read.
 *
 * A failed read throws to the segment boundary; a failed LAYER comes back in
 * `unavailable` and the page names it — the two are different states. A
 * refusal the page can act on (a month out of reach, a role that reads
 * nothing) comes back as what to do instead. Null: no active business, or
 * none found.
 */
export async function getCalendarMonth(
    month: string,
): Promise<CalendarRead | null> {
    const { from, to } = monthSpan(month);
    return readCalendar(from, to);
}

/**
 * The Week (plan 005 E25): Monday to Sunday of the week holding `day`, in
 * one read even when it crosses into another month. Read and refused as a
 * month is; `data.month` is the month the Monday is in.
 */
export async function getCalendarWeek(
    day: string,
): Promise<CalendarRead | null> {
    const { from, to } = weekSpan(day);
    return readCalendar(from, to);
}

async function readCalendar(
    from: string,
    to: string,
): Promise<CalendarRead | null> {
    const base = await orgBase();
    if (!base) return null;
    const path = `${base}/calendar?from=${from}&to=${to}`;
    const res = await apiFetch(path);
    if (res.status === 404) return null;
    if (res.status === 403) return { kind: "locked" };
    if (res.status === 400) {
        const open = monthToOpen(await res.json().catch(() => null));
        if (open) return { kind: "open", month: open };
    }
    if (!res.ok) throw new ApiError(res.status, `GET ${path}`);
    return { kind: "month", data: (await res.json()) as CalendarMonth };
}

/** "YYYY-MM" of now in a zone; the server's clock, the business's calendar. */
export function monthNow(timeZone: string): string {
    return localDateKey(new Date(), timeZone).slice(0, 7);
}

/** "YYYY-MM-DD" of now in a zone. */
export function todayIn(timeZone: string): string {
    return localDateKey(new Date(), timeZone);
}
