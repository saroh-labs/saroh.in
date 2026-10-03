import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { LIMIT_WARN_AT, limitNotice } from "@saroh/pricing-catalog";

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

/** The notice's words: the design's 80% / 100% (`limitNotice`), or past it. */
export function limitNoticeWords(
    row: Pick<ModuleAccess, "plan" | "upgradeTo">,
    key: MeteredLimitKey,
    limit: number,
    used: number,
    level: LimitLevel,
): { title: string; body: string } {
    const words = METER_WORDS[key];
    if (level === "over") {
        const more = row.upgradeTo
            ? `${row.upgradeTo} raises the limit.`
            : "An add-on gives you more.";
        return {
            title: `You're past your ${limit.toLocaleString("en-IN")} ${words.what} on ${row.plan}`,
            body:
                key === "ordersPerMonth"
                    ? `Your site kept taking orders, so no customer was turned away. ${more}`
                    : `What you already have stays as it is. ${more}`,
        };
    }
    const n = limitNotice(
        { inc: true, limit, plan: row.plan, upgradeTo: row.upgradeTo },
        used,
        words.what,
        words.paused,
    );
    return n.on ? { title: n.title, body: n.body } : { title: "", body: "" };
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
        const eventKey = `plan-limit:${p.moduleId}:${level}:${limit}:${windowKey(row.per, now, zone)}`;
        const { title, body } = limitNoticeWords(row, key, limit, used, level);
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
