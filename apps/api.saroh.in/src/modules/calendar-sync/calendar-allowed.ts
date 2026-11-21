import { ForbiddenException, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { planMeter } from "../billing/metering.service";
import { moduleLocked } from "../billing/plan-limit-errors";
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
    if (await calendarPlan.locked(organizationId)) return "plan";
    return null;
}

/** The catalogue row Google Calendar rides (`integrations`, Free locked). */
export const PLAN_ROW = "integrations";

const catalogue = new CatalogueAccessService();
const logger = new Logger("CalendarPlan");

/**
 * Google Calendar's plan check (P3). Fails closed, as Social's and Ask
 * AI's do: a business the catalogue doesn't reach, a version without the
 * row or a plan that can't be read is locked, since every sync is Saroh's
 * work on its one Google quota. Behind the `PLAN_ENFORCEMENT` kill switch
 * nothing is locked, as for every other use of this row.
 * An object, so a spec can stand in for it.
 */
export const calendarPlan = {
    /** Null when on; else the row that locks it, or "unread". */
    async locked(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<ModuleAccess | "unread" | null> {
        try {
            if (!(await planMeter.enforcing(organizationId))) return null;
            const a = await catalogue.resolve(organizationId, now);
            const row =
                a.source === "catalogue"
                    ? a.modules.find((m) => m.moduleId === PLAN_ROW)
                    : undefined;
            if (row?.state === "on") return null;
            return row ?? "unread";
        } catch (err) {
            logger.warn(
                `google_calendar_plan_unread org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return "unread";
        }
    },
};

/** Refuse (403 `MODULE_LOCKED`) unless the plan has Google Calendar (P3). */
export async function assertCalendarPlan(
    organizationId: string,
): Promise<void> {
    const locked = await calendarPlan.locked(organizationId);
    if (!locked) return;
    if (locked !== "unread") throw moduleLocked(locked);
    throw new ForbiddenException({
        message: "Google Calendar isn't in your plan.",
        details: {
            code: "MODULE_LOCKED",
            moduleId: PLAN_ROW,
            plan: null,
            upgradeTo: null,
        },
    });
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

/**
 * The connections whose busy times may block slots here now, or null when
 * none may (the flag or the plan off): of the people who may sync, every
 * connected account but those past the plan's allowance, so an account
 * paused by a downgrade stops blocking at once, not at its next busy
 * read (P4).
 */
export async function googleBusyConnections(
    organizationId: string,
): Promise<Set<string> | null> {
    const members = await googleBusyAllowed(organizationId);
    if (!members) return null;
    const [over, rows] = await Promise.all([
        overAllowance(organizationId),
        prisma.googleCalendarConnection.findMany({
            where: {
                organizationId,
                status: "CONNECTED",
                membershipId: { in: [...members] },
            },
            select: { id: true },
        }),
    ]);
    return new Set(rows.map((r) => r.id).filter((id) => !over.has(id)));
}
