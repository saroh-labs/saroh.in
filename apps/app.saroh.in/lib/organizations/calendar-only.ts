/**
 * Giving someone on the diary a login (#868; owner decision 2026-10-08).
 *
 * Someone who takes bookings with no login (DEC-105) and is invited later
 * joins as **Calendar only** by default — their own diary and nothing else
 * — though the owner can pick any other role in the invite. The API makes
 * the role (key `calendar-only`) for every business with someone on the
 * diary, narrows what it reaches to the person's own bookings, and links
 * the diary person to the new login when the invite is accepted.
 *
 * Pure, so the invite dialog's rules are pinned without a browser.
 */

/** The role's key, as the API stores it. */
export const CALENDAR_ONLY_ROLE = "calendar-only";

/** What the role is for, wherever one is picked. */
export const CALENDAR_ONLY_BLURB =
    "Their own diary only — sees and changes the bookings they take. No customer list, no team, no money.";

/** The same, in a few words. */
export const CALENDAR_ONLY_PLAIN = "their own diary only";

/** One person on the diary, as the invite offers them. */
export interface DiaryPerson {
    id: string;
    name: string;
}

/**
 * The people on the diary who could be given a login: taking bookings,
 * with no login yet, and no invite already waiting for them (the API
 * refuses a second; resend the first from the list).
 */
export function diaryPeopleToInvite(
    staff:
        | readonly {
              id: string;
              name: string;
              status: string;
              membership: unknown;
          }[]
        | null,
    invitations: readonly { staff?: { id: string } | null }[],
): DiaryPerson[] {
    const waiting = new Set(
        invitations.flatMap((i) => (i.staff ? [i.staff.id] : [])),
    );
    return (staff ?? [])
        .filter(
            (s) => s.status === "ACTIVE" && !s.membership && !waiting.has(s.id),
        )
        .map((s) => ({ id: s.id, name: s.name }));
}

/**
 * The role to show picked after choosing who on the diary this is for:
 * Calendar only when someone is chosen and the business has the role,
 * the dialog's usual start when the choice is cleared, and otherwise
 * whatever the owner had picked.
 */
export function roleAfterDiaryPick(input: {
    staffId: string;
    current: string;
    start: string;
    hasCalendarOnly: boolean;
}): string {
    if (input.staffId) {
        return input.hasCalendarOnly ? CALENDAR_ONLY_ROLE : input.current;
    }
    return input.current === CALENDAR_ONLY_ROLE ? input.start : input.current;
}
