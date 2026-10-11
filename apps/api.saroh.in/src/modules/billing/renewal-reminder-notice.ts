import type { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { enqueueBillingEmail } from "./billing-email.job";
import {
    RENEWAL_REMINDER_NOTICE_KIND,
    renewalReminderCandidates,
    renewalReminderEventKey,
    renewalReminderOf,
} from "./renewal-reminder";

/**
 * The billing sweep's step for plans about to renew (#804,
 * `renewal-reminder.ts`): every autopay charge due within 3 days is told
 * once — a `RENEWAL` billing email to the business's billing people,
 * claimed as a `CustomerNotice` on the same transaction, so a second sweep
 * (or a second worker) queues nothing. One that fails never stops the rest.
 * Returns how many were told.
 */
export async function remindRenewals(
    now: Date,
    logger: Pick<Logger, "error">,
): Promise<number> {
    const ids = await renewalReminderCandidates(prisma, now);
    let told = 0;
    for (const id of ids) {
        try {
            if (await remindRenewal(id, now)) told += 1;
        } catch (error) {
            logger.error(
                `renewal_reminder_failed subscription=${id}: ${String(error)}`,
            );
        }
    }
    return told;
}

async function remindRenewal(
    subscriptionId: string,
    now: Date,
): Promise<boolean> {
    const due = await renewalReminderOf(prisma, subscriptionId, now);
    if (!due) return false;
    const { organizationId, renewsAt } = due;
    const eventKey = renewalReminderEventKey(subscriptionId, renewsAt);
    return prisma.$transaction(async (tx) => {
        const claim = await tx.customerNotice.createMany({
            data: [
                {
                    organizationId,
                    eventKey,
                    kind: RENEWAL_REMINDER_NOTICE_KIND,
                },
            ],
            skipDuplicates: true,
        });
        if (claim.count === 0) return false;
        await enqueueBillingEmail(tx, {
            kind: "RENEWAL",
            organizationId,
            subscriptionId,
            renewsAt: renewsAt.toISOString(),
        });
        return true;
    });
}
