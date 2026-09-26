import { getJson, orgBase } from "@/lib/api/http";
import { localDateKey } from "@/lib/format/datetime";

import type { CalendarMonth } from "./types";

/**
 * The Business Calendar's month (U4's `GET organizations/:org/calendar`): every
 * day of the month with every layer this viewer may see, what needs acting on,
 * the takings (money roles only) and the layers that could not be read.
 *
 * A failed read throws to the segment boundary; a failed LAYER comes back in
 * `unavailable` and the page names it — the two are different states.
 */
export async function getCalendarMonth(
    month: string,
): Promise<CalendarMonth | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<CalendarMonth>(
        `${base}/calendar?month=${encodeURIComponent(month)}`,
    );
}

/** "YYYY-MM" of now in a zone; the server's clock, the business's calendar. */
export function monthNow(timeZone: string): string {
    return localDateKey(new Date(), timeZone).slice(0, 7);
}

/** "YYYY-MM-DD" of now in a zone. */
export function todayIn(timeZone: string): string {
    return localDateKey(new Date(), timeZone);
}
