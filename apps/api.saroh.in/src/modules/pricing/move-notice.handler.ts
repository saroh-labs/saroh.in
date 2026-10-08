import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import type { MoveNoticePayload } from "./moves.service";

/** The inbox notice a business gets ahead of its plan moving (KTD-4). */
export const PLAN_MOVE_NOTIFICATION_TYPE = "plan.move";

/** The once-only claim on a move's notice (`CustomerNotice.kind`). */
const PLAN_MOVE_NOTICE_KIND = "PLAN_MOVE";

function parsePayload(payload: unknown): MoveNoticePayload | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (
        typeof p.subscriptionId !== "string" ||
        typeof p.pendingPlanId !== "string" ||
        typeof p.pendingFrom !== "string"
    ) {
        return null;
    }
    return {
        subscriptionId: p.subscriptionId,
        pendingPlanId: p.pendingPlanId,
        pendingFrom: p.pendingFrom,
    };
}

/** "12 November 2026", in the business's own time zone. */
export function moveDateWords(at: Date, zone: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: zone,
    }).format(at);
}

/**
 * Tell a business, seven days ahead (`MOVE_NOTICE_DAYS`), that its Saroh
 * plan moves to the latest version on that date (`pricing.move.notice`).
 *
 * Re-read, then decide: a move cancelled (the version was), replaced (a
 * newer publish moved it again) or already applied says nothing. Once per
 * move, claimed as a `CustomerNotice` before the inbox row is written, so a
 * redelivered job can't tell the business twice. What exactly changes and
 * the price are shown on Settings › Plan (U14); this notice carries neither.
 */
@Injectable()
export class MoveNoticeHandler {
    private readonly logger = new Logger(MoveNoticeHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const p = parsePayload(job.payload);
        if (!p) {
            this.logger.error(`pricing_move_notice_bad_payload job=${job.id}`);
            return;
        }
        const sub = await prisma.subscription.findUnique({
            where: { id: p.subscriptionId },
            select: {
                organizationId: true,
                pendingPlanId: true,
                pendingFrom: true,
                pendingPlan: { select: { name: true } },
            },
        });
        if (
            !sub?.pendingPlan ||
            sub.pendingPlanId !== p.pendingPlanId ||
            sub.pendingFrom?.toISOString() !== p.pendingFrom
        ) {
            this.logger.log(
                `pricing_move_notice_skipped job=${job.id} reason=move_changed`,
            );
            return;
        }
        const zone = await businessTimezone(prisma, sub.organizationId);
        const when = moveDateWords(sub.pendingFrom, zone);
        const eventKey = `plan-move:${p.subscriptionId}:${p.pendingFrom}`;
        const planName = sub.pendingPlan.name;
        await prisma.$transaction(async (tx) => {
            const claim = await tx.customerNotice.createMany({
                data: [
                    {
                        organizationId: sub.organizationId,
                        eventKey,
                        kind: PLAN_MOVE_NOTICE_KIND,
                    },
                ],
                skipDuplicates: true,
            });
            if (claim.count === 0) return;
            const notice = await tx.notification.create({
                data: {
                    organizationId: sub.organizationId,
                    type: PLAN_MOVE_NOTIFICATION_TYPE,
                    title: `Your ${planName} plan changes on ${when}`,
                    body: `Saroh has updated its plans. From ${when}, your business is on the latest ${planName} plan.`,
                },
                select: { id: true },
            });
            await tx.customerNotice.updateMany({
                where: { organizationId: sub.organizationId, eventKey },
                data: { notificationId: notice.id },
            });
        });
    };
}
