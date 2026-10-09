import type { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { paperDay } from "../invoices/invoice-paper-view";
import { enqueueBillingEmail } from "./billing-email.job";
import { freeChosenNotice, termEndingNotice } from "./billing-emails";
import { FREE_PLAN_ID } from "./catalogue-access.service";
import { pausesForMoveInTx } from "./move-down-notice";
import type { OverLimitService } from "./over-limit.service";
import { overLimit } from "./over-limit.service";
import { PLAN_ENDING_NOTIFICATION_TYPE } from "./plan-ending";
import {
    TERM_ENDING_NOTICE_KIND,
    termEndingCandidates,
    termEndingEventKey,
    termEndingOf,
} from "./term-ending";

/**
 * The billing sweep's step for terms that end (DEC-100, `term-ending.ts`):
 * every subscription whose 12-month term ends within the renew window is
 * asked, once per stage, to pay for the next term (or, when its owner
 * chose Free for then, told it moves to Free as it chose) — an inbox notice
 * (`plan.ending`, opening the plans) and a `TERM_ENDING` billing email,
 * claimed as a `CustomerNotice` on one transaction. One that fails never
 * stops the rest. Returns how many were told. What Free then pauses
 * (#801) is listed too, and starts the 7-day clock.
 */
export async function remindEndingTerms(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: OverLimitService = overLimit,
): Promise<number> {
    const ids = await termEndingCandidates(prisma, now);
    let told = 0;
    for (const id of ids) {
        try {
            if (await remindTerm(id, now, svc)) told += 1;
        } catch (error) {
            logger.error(
                `term_ending_notice_failed subscription=${id}: ${String(error)}`,
            );
        }
    }
    return told;
}

async function remindTerm(
    subscriptionId: string,
    now: Date,
    svc: OverLimitService,
): Promise<boolean> {
    const ending = await termEndingOf(prisma, subscriptionId, now);
    if (!ending) return false;
    const { organizationId, term, stage } = ending;
    const eventKey = termEndingEventKey(subscriptionId, term.endsAt, stage);
    const zone = await businessTimezone(prisma, organizationId);
    const said = {
        planName: ending.planName,
        endsOn: paperDay(term.endsAt.toISOString(), zone),
    };
    // Not paid for again, the term moves to Free at its end (`term-end.ts`).
    const measure = await svc.previewOnPlan(
        organizationId,
        FREE_PLAN_ID,
        term.endsAt,
        now,
    );
    return prisma.$transaction(async (tx) => {
        const claim = await tx.customerNotice.createMany({
            data: [{ organizationId, eventKey, kind: TERM_ENDING_NOTICE_KIND }],
            skipDuplicates: true,
        });
        if (claim.count === 0) return false;
        const pauses = await pausesForMoveInTx(
            tx,
            organizationId,
            measure,
            term.endsAt,
            zone,
            now,
        );
        const words = ending.chosenFree
            ? freeChosenNotice({ ...said, pauses })
            : termEndingNotice({ ...said, pauses });
        const notice = await tx.notification.create({
            data: {
                organizationId,
                type: PLAN_ENDING_NOTIFICATION_TYPE,
                title: words.title,
                body: words.body,
            },
            select: { id: true },
        });
        await tx.customerNotice.updateMany({
            where: { organizationId, eventKey },
            data: { notificationId: notice.id },
        });
        await enqueueBillingEmail(tx, {
            kind: "TERM_ENDING",
            organizationId,
            subscriptionId,
            endsAt: term.endsAt.toISOString(),
            stage,
            pauses,
        });
        return true;
    });
}
