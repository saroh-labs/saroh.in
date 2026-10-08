import type { OrgAction } from "./organization-actions";

/**
 * The "Calendar only" role (#868; owner decision 2026-10-08), as the API
 * reasons about it.
 *
 * Someone on the diary taking bookings with no login (DEC-105), given a
 * login later, joins in it by default: their own diary and nothing else.
 * The row, its list and `ensureCalendarOnlyRole` live in `@saroh/database`
 * (`calendar-only-role.ts`), where the seed can reach them too. This file is
 * deliberately free of that import: the policy reads it, and the policy is
 * imported by every unit spec, many of which mock `@saroh/database`. Its
 * spec proves the two lists are the same, that each is a real action, and
 * that none reads money, customers or the team.
 *
 * What it reaches is narrowed to the person's own bookings by the key
 * (`bookings/own-diary.ts`), as `storefront-team` narrows orders.
 */

/** The role's key, stable across businesses; `Membership.role` holds it. */
export const CALENDAR_ONLY_ROLE_KEY = "calendar-only";

/** What "Calendar only" holds when a business first gets it. */
export const CALENDAR_ONLY_ACTIONS: readonly OrgAction[] = [
    "org:read",
    "module:read",
    "booking:read",
    "booking:write",
    "service:read",
];

/** Whether a role key is the Calendar only role. */
export function isCalendarOnly(roleKey: string | null | undefined): boolean {
    return roleKey === CALENDAR_ONLY_ROLE_KEY;
}
