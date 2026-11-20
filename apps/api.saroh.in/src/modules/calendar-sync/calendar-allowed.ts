import { prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { teamHolding } from "../organizations/team-powers";

/**
 * Whether a connection may sync now (GC-02, GC-03), asked again by both
 * jobs and by every slot read, not only when connecting:
 * - the business: the `GOOGLE_CALENDAR` flag and the plan's `integrations`
 *   row (Free locked);
 * - the person: still holding `calendar:connect-own` (and not paused past
 *   the plan's member limit), and still on the diary;
 * - the account: within the plan's Google accounts a person
 *   ({@link overAllowance}), so a downgrade pauses the extra ones.
 *
 * A connection that isn't allowed is PAUSED, not deleted: it is kept with
 * its choices, nothing goes to Google or comes from it, its busy times
 * don't block, and it carries on by itself once allowed again (the daily
 * sweep restarts its busy reads). The person, or anyone who may change
 * their role, can still disconnect it.
 */

/** Why a connection is paused. */
export type PauseReason = "off" | "plan" | "permission" | "diary";

type Flags = Pick<FeatureFlagService, "isEnabled">;

const defaultFlags = new FeatureFlagService();

/** The business half: the flag, then the plan. Null when on. */
export async function businessPause(
    organizationId: string,
    flags: Flags = defaultFlags,
): Promise<"off" | "plan" | null> {
    if (!(await flags.isEnabled("GOOGLE_CALENDAR", organizationId))) {
        return "off";
    }
    if (!(await planMeter.isIncluded(organizationId, "integrations"))) {
        return "plan";
    }
    return null;
}

/** The memberships here whose connections may sync: they hold the permission now. */
export async function syncingMembers(
    organizationId: string,
): Promise<Set<string>> {
    const team = await teamHolding(organizationId, "calendar:connect-own");
    return new Set(team.map((m) => m.membershipId));
}

/**
 * Why this person's connection is paused, or null when it may sync. With
 * `connectionId`, also when that one account is past the plan's allowance.
 */
export async function pausedBecause(
    organizationId: string,
    membershipId: string,
    flags: Flags = defaultFlags,
    connectionId?: string,
): Promise<PauseReason | null> {
    const business = await businessPause(organizationId, flags);
    if (business) return business;
    if (!(await syncingMembers(organizationId)).has(membershipId)) {
        return "permission";
    }
    const staff = await prisma.staffMember.count({
        where: { organizationId, membershipId },
    });
    if (staff === 0) return "diary";
    if (
        connectionId &&
        (await overAllowance(organizationId)).has(connectionId)
    ) {
        return "plan";
    }
    return null;
}

/** The catalogue row that caps Google accounts a person (DEC-233). */
export const ACCOUNTS_ROW = "google-accounts";

/**
 * How many Google accounts one person may connect here (DEC-233): the
 * plan's `googleAccountsPerPerson`, null for no cap. A plan without the
 * row (or nothing enforced) allows one, as before the row existed.
 */
export async function accountsAllowed(
    organizationId: string,
): Promise<number | null> {
    const row = await planMeter.enforcedRow(organizationId, ACCOUNTS_ROW);
    if (row?.state !== "on") return 1;
    return row.limit;
}

/**
 * The connections here past each person's allowance (DEC-233), as after a
 * downgrade: paused for the plan, nothing goes to or comes from them. Kept
 * are the account bookings go to, then the earliest connected.
 */
export async function overAllowance(
    organizationId: string,
): Promise<Set<string>> {
    const allowed = await accountsAllowed(organizationId);
    if (allowed === null) return new Set();
    const rows = await prisma.googleCalendarConnection.findMany({
        where: { organizationId, status: { in: ["CONNECTED", "LAPSED"] } },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            membershipId: true,
            calendars: { where: { writeTo: true }, select: { id: true } },
        },
    });
    const byPerson = new Map<string, typeof rows>();
    for (const row of rows) {
        byPerson.set(row.membershipId, [
            ...(byPerson.get(row.membershipId) ?? []),
            row,
        ]);
    }
    const over = new Set<string>();
    for (const mine of byPerson.values()) {
        const ranked = [
            ...mine.filter((r) => r.calendars.length > 0),
            ...mine.filter((r) => r.calendars.length === 0),
        ];
        for (const row of ranked.slice(allowed)) over.add(row.id);
    }
    return over;
}

/**
 * The memberships whose connections count here now, or null when none do
 * (the flag or the plan off). Slot reads ask it only when there are busy
 * times to count, so a business without the feature pays nothing.
 */
export async function googleBusyAllowed(
    organizationId: string,
): Promise<Set<string> | null> {
    if (await businessPause(organizationId)) return null;
    return syncingMembers(organizationId);
}
