/**
 * The "Calendar only" role (#868, DEC-105 follow-up; owner decision
 * 2026-10-08).
 *
 * Someone on the diary who takes bookings with no login (DEC-105) and is
 * later given one joins in this role by default: their own diary, and
 * nothing else in the business. Not Member — a Member reads the whole
 * diary, every customer's details and the team — and the owner can still
 * pick another role in the invite.
 *
 * What it holds: the business and its modules (to open the workspace at
 * all), the diary and the services on it, and changing bookings. The API
 * narrows the diary to the person's own bookings — the ones they take, and
 * those nobody was put on for a service they take — by this key
 * (`bookings/own-diary.ts`), as `storefront-team` narrows orders to a
 * location (DEC-074). No customers list, no team roster, no money: no
 * payment, invoice, order, pack or membership power, so no figures and no
 * desk payment (`mayTakeDeskPayment` needs `invoice:write`).
 *
 * It changes bookings, so whoever holds it uses a team seat (DEC-105) —
 * as they did before, taking bookings with no login.
 *
 * Like "Storefront team", it is an ordinary role row (`OrganizationRole`,
 * key `calendar-only`), made when a business first puts someone on the
 * diary or invites someone as it; the migration
 * `20261031100000_calendar_only_role` made it for every business that
 * already had someone on the diary. The owner may widen it; the narrowing
 * to their own diary stays with the key.
 */
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** The role's key, stable across businesses; `Membership.role` holds it. */
export const CALENDAR_ONLY_ROLE_KEY = "calendar-only";
/** What Team calls it until the owner renames it. */
export const CALENDAR_ONLY_ROLE_LABEL = "Calendar only";
/**
 * What the role holds when it is made. The API's
 * `organizations/calendar-only-role.ts` checks each is a real action and
 * that none of them reads money, customers or the team.
 */
export const CALENDAR_ONLY_ACTIONS: readonly string[] = [
    "org:read",
    "module:read",
    "booking:read",
    "booking:write",
    "service:read",
];

/**
 * The business's "Calendar only" role, made with the narrow list when it
 * has none. A role that exists is returned as it is — the owner may have
 * changed it on purpose.
 */
export async function ensureCalendarOnlyRole(
    tx: Pick<Tx, "organizationRole">,
    organizationId: string,
): Promise<{ key: string; actions: string[] }> {
    return tx.organizationRole.upsert({
        where: {
            organizationId_key: {
                organizationId,
                key: CALENDAR_ONLY_ROLE_KEY,
            },
        },
        create: {
            organizationId,
            key: CALENDAR_ONLY_ROLE_KEY,
            label: CALENDAR_ONLY_ROLE_LABEL,
            actions: [...CALENDAR_ONLY_ACTIONS],
            // The ring every invented role wears (organization-roles.service).
            ringTone: "neutral",
        },
        update: {},
        select: { key: true, actions: true },
    });
}
