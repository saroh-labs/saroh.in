import type { CalendarMember } from "./types";

/**
 * Team's Google Calendar column by user id (DEC-233): the API names each
 * person by membership and diary place, the roster by user, so the diary
 * (`StaffView.membership.userId`) joins them. Someone off the diary has no
 * calendar sync to show.
 */
export function calendarByUser(
    members: readonly CalendarMember[],
    staff:
        | readonly { id: string; membership?: { userId: string } | null }[]
        | null,
): Record<string, CalendarMember> {
    const userOf = new Map(
        (staff ?? []).flatMap((s) =>
            s.membership ? [[s.id, s.membership.userId] as const] : [],
        ),
    );
    const out: Record<string, CalendarMember> = {};
    for (const m of members) {
        const user = m.staffId ? userOf.get(m.staffId) : undefined;
        if (user) out[user] = m;
    }
    return out;
}
