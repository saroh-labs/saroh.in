import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { LIMIT_WARN_AT, limitNotice } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import { businessTimezone } from "../bookings/staff-availability";
import { CatalogueAccessService } from "./catalogue-access.service";
import type { MeteredLimitKey } from "./metering";
import { countUsage, METER_WORDS, meteredKeyOf, windowKey } from "./metering";
import type { PlanLimitNoticePayload } from "./metering.service";
import { MeteringService } from "./metering.service";

/** The inbox notice a business gets near or at a plan limit. */
export const PLAN_LIMIT_NOTIFICATION_TYPE = "plan.limit";

/** The once-only claim on a limit notice (`CustomerNotice.kind`). */
const PLAN_LIMIT_NOTICE_KIND = "PLAN_LIMIT";

/** Which notice a count earns: 80%, the cap, or past it (a soft cap). */
export type LimitLevel = "warn" | "full" | "over";

export function limitLevel(used: number, limit: number): LimitLevel | null {
    if (used > limit) return "over";
    if (used >= limit) return "full";
    if (used >= Math.ceil(LIMIT_WARN_AT * limit)) return "warn";
    return null;
}

/** The once-only key a limit notice is claimed under (`CustomerNotice.eventKey`). */
export function limitNoticeKey(
    moduleId: string,
    level: LimitLevel,
    limit: number,
    window: string,
): string {
    return `plan-limit:${moduleId}:${level}:${limit}:${window}`;
}

/** "1 Nov": the day the business's next month starts, in its zone. */
export function nextMonthStarts(now: Date, zone: string): string {
    return DateTime.fromJSDate(now, { zone })
        .startOf("month")
        .plus({ months: 1 })
        .toFormat("d LLL");
}

/** What past a cap says, by key: what kept working. */
function overBody(key: MeteredLimitKey, soft: boolean): string {
    if (key === "ordersPerMonth")
        return "Your site kept taking orders, so no customer was turned away.";
    if (key === "sarohEmailsPerMonth") return METER_WORDS[key].paused;
    // A soft cap's own words say nothing was stopped (`LIMIT_WORDS.paused`).
    if (soft) return METER_WORDS[key].paused;
    return "What you already have stays as it is.";
}

/**
 * The notice's words: the design's 80% / 100% (`limitNotice`), or past it.
 * A soft cap (`ModuleAccess.soft`: storage, visits) never stops anything,
 * so its 80% notice doesn't say "you'll be stopped".
 */
export function limitNoticeWords(
    row: Pick<ModuleAccess, "plan" | "upgradeTo"> & { soft?: boolean },
    key: MeteredLimitKey,
    limit: number,
    used: number,
    level: LimitLevel,
    /** When a monthly count starts again ("1 Nov"), for a limit that says so. */
    resetsOn?: string,
): { title: string; body: string } {
    const words = METER_WORDS[key];
    const soft = row.soft === true;
    if (level === "over") {
        // A limit with its own way out (Saroh's emails) offers no add-on.
        const more = words.action
            ? `${words.action.sentence}${row.upgradeTo ? ` Or ${row.upgradeTo} raises the limit.` : ""}`
            : row.upgradeTo
              ? `${row.upgradeTo} raises the limit.`
              : "An add-on gives you more.";
        return {
            title: `You're past your ${limit.toLocaleString("en-IN")} ${words.what} on ${row.plan}`,
            body: `${overBody(key, soft)} ${more}`,
        };
    }
    // The shared rule words a soft cap too, so the inbox and the screen agree.
    const n = limitNotice(
        { inc: true, limit, plan: row.plan, upgradeTo: row.upgradeTo, soft },
        used,
        words.what,
        words.paused,
        { action: words.action, resetsOn },
    );
    if (!n.on) return { title: "", body: "" };
    return { title: n.title, body: n.body };
}

function parsePayload(payload: unknown): PlanLimitNoticePayload | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.organizationId !== "string" || typeof p.moduleId !== "string")
        return null;
    return { organizationId: p.organizationId, moduleId: p.moduleId };
}

/**
 * Tell a business it is near (80%) or at (100%) a plan limit, or past a
 * soft one (`plan.limit.notice`, plans catalogue U13, R7). A metered write
 * queues it on its own transaction when it crosses a line
 * (`MeteringService.roomInTx`).
 *
 * Re-read, then decide: with the kill switch off since, the row unlimited
 * or off now, or the count back under 80%, it says nothing. Once per row,
 * level, limit and window (the month, for a monthly limit), claimed as a
 * `CustomerNotice` before the inbox row is written, so a redelivered job or
 * a second write crossing the same line tells the business once. The inbox
 * is the owners' and admins' (`notification:read`).
 */
@Injectable()
export class PlanLimitNoticeHandler {
    private readonly logger = new Logger(PlanLimitNoticeHandler.name);

    constructor(
        private readonly access: CatalogueAccessService,
        private readonly meter: MeteringService,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = parsePayload(job.payload);
        if (!p) {
            this.logger.error(`plan_limit_notice_bad_payload job=${job.id}`);
            return;
        }
        const skip = (reason: string) =>
            this.logger.log(
                `plan_limit_notice_skipped job=${job.id} reason=${reason}`,
            );
        if (!(await this.meter.enforcing(p.organizationId)))
            return skip("not_enforced");
        const key = meteredKeyOf(p.moduleId);
        if (!key) return skip("not_metered");
        const now = new Date();
        const a = await this.access.resolve(p.organizationId, now);
        if (a.source !== "catalogue") return skip("off_catalogue");
        const row = a.modules.find((m) => m.moduleId === p.moduleId);
        if (row?.state !== "on" || row.limit === null) return skip("no_limit");
        const limit = row.limit;
        const used = await countUsage(prisma, p.organizationId, key, now);
        const level = limitLevel(used, limit);
        if (!level) return skip("under");

        const zone = await businessTimezone(prisma, p.organizationId);
        const eventKey = limitNoticeKey(
            p.moduleId,
            level,
            limit,
            windowKey(row.per, now, zone),
        );
        // A limit that names its own way out says when its month restarts.
        const resetsOn =
            METER_WORDS[key].action && row.per === "month"
                ? nextMonthStarts(now, zone)
                : undefined;
        const { title, body } = limitNoticeWords(
            row,
            key,
            limit,
            used,
            level,
            resetsOn,
        );
        await prisma.$transaction(async (tx) => {
            const claim = await tx.customerNotice.createMany({
                data: [
                    {
                        organizationId: p.organizationId,
                        eventKey,
                        kind: PLAN_LIMIT_NOTICE_KIND,
                    },
                ],
                skipDuplicates: true,
            });
            if (claim.count === 0) return;
            const notice = await tx.notification.create({
                data: {
                    organizationId: p.organizationId,
                    type: PLAN_LIMIT_NOTIFICATION_TYPE,
                    title,
                    body,
                },
                select: { id: true },
            });
            await tx.customerNotice.updateMany({
                where: { organizationId: p.organizationId, eventKey },
                data: { notificationId: notice.id },
            });
        });
    };
}
