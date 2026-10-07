import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { businessTimezone } from "../bookings/staff-availability";
import { countUsage, meteredKeyOf, windowKey } from "./metering";
import { planMeter } from "./metering.service";
import type { LimitLevel } from "./plan-limit-notice.handler";
import {
    limitLevel,
    PLAN_LIMIT_NOTICE_KIND,
} from "./plan-limit-notice.handler";

/**
 * A plan limit notice that no longer stands is taken out of the inbox
 * (UX-041): "You've reached your 2 team members on Free" stayed after the
 * team went back under its cap. Read when the inbox is read, since a count
 * drops in many places (a member removed, a product deleted, a new month)
 * and none of them tells the notices.
 *
 * A notice clears when its row is uncapped, off or no longer enforced, its
 * limit changed (a plan move: its words are about the old plan), its month
 * is over, or the count is back under the line it was told at. The notice
 * and its once-only claim go together, so crossing the line again tells
 * the business again.
 */

const logger = new Logger("LimitNoticeClear");

const RANK: Record<LimitLevel, number> = { warn: 1, full: 2, over: 3 };

/** What a told notice's once-only key says (`limitNoticeKey`). */
export interface ToldLimit {
    moduleId: string;
    level: LimitLevel;
    limit: number;
    window: string;
}

/** Read `plan-limit:<row>:<level>:<limit>:<window>`; null for anything else. */
export function parseLimitNoticeKey(eventKey: string): ToldLimit | null {
    const parts = eventKey.split(":");
    if (parts.length !== 5 || parts[0] !== "plan-limit") return null;
    const [, moduleId, level, limit, window] = parts;
    if (level !== "warn" && level !== "full" && level !== "over") return null;
    const n = Number(limit);
    if (!moduleId || !Number.isInteger(n) || !window) return null;
    return { moduleId, level, limit: n, window };
}

/** Where the row stands now, as far as the notice is concerned. */
export interface LimitNow {
    /** The row's cap now; null when it is off, uncapped or not enforced. */
    limit: number | null;
    used: number;
    /** The window a notice told now would be in. */
    window: string;
}

/** Whether a told notice no longer stands. Pure. */
export function limitNoticeCleared(told: ToldLimit, now: LimitNow): boolean {
    if (now.limit === null || now.limit !== told.limit) return true;
    if (now.window !== told.window) return true;
    const level = limitLevel(now.used, now.limit);
    return level === null || RANK[level] < RANK[told.level];
}

/** What the clear reads beyond the inbox (stand-ins in tests). */
export interface ClearDeps {
    row: (
        organizationId: string,
        moduleId: string,
        now: Date,
    ) => Promise<ModuleAccess | null>;
    used: (
        organizationId: string,
        moduleId: string,
        now: Date,
    ) => Promise<number>;
    zone: (organizationId: string) => Promise<string>;
}

const defaultDeps: ClearDeps = {
    row: (organizationId, moduleId, now) =>
        planMeter.enforcedRowOrThrow(organizationId, moduleId, now),
    used: (organizationId, moduleId, now) => {
        const key = meteredKeyOf(moduleId);
        return key
            ? countUsage(prisma, organizationId, key, now)
            : Promise.resolve(0);
    },
    zone: (organizationId) => businessTimezone(prisma, organizationId),
};

/**
 * Take the business's limit notices that no longer stand out of its inbox,
 * with their claims. Returns how many went. Never throws: a lookup that
 * fails leaves the notices as they are (logged), and the inbox still reads.
 */
export async function clearStaleLimitNotices(
    organizationId: string,
    now: Date = new Date(),
    deps: ClearDeps = defaultDeps,
): Promise<number> {
    try {
        const told = await prisma.customerNotice.findMany({
            where: { organizationId, kind: PLAN_LIMIT_NOTICE_KIND },
            select: { id: true, eventKey: true, notificationId: true },
        });
        if (told.length === 0) return 0;

        let zone: string | null = null;
        const stale: typeof told = [];
        for (const notice of told) {
            const parsed = parseLimitNoticeKey(notice.eventKey);
            if (!parsed) continue;
            const row = await deps.row(organizationId, parsed.moduleId, now);
            const limit = row?.state === "on" ? row.limit : null;
            if (limit === null || !row) {
                stale.push(notice);
                continue;
            }
            if (row.per === "month") {
                zone ??= await deps.zone(organizationId);
            }
            const cleared = limitNoticeCleared(parsed, {
                limit,
                used: await deps.used(organizationId, parsed.moduleId, now),
                window: windowKey(row.per, now, zone ?? "UTC"),
            });
            if (cleared) stale.push(notice);
        }
        if (stale.length === 0) return 0;

        const notificationIds = stale
            .map((n) => n.notificationId)
            .filter((id): id is string => id !== null);
        await prisma.$transaction(async (tx) => {
            await tx.notification.deleteMany({
                where: { organizationId, id: { in: notificationIds } },
            });
            await tx.customerNotice.deleteMany({
                where: { organizationId, id: { in: stale.map((n) => n.id) } },
            });
        });
        return stale.length;
    } catch (err) {
        logger.warn(
            `limit_notice_clear_failed org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return 0;
    }
}
