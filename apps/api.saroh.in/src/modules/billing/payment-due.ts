import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { enqueueBillingEmail } from "./billing-email.job";
import { enqueueProviderCancel } from "./provider-cancel.job";

/**
 * A renewal that wasn't paid (DEC-210, owner 6 Nov 2026: "charging again
 * won't solve anything"). The first failed charge makes the payment due:
 * the plan stays for {@link PAYMENT_DUE_DAYS} days, the business is told
 * once with a way to pay (Plan and billing, and a banner in the app), and
 * the provider's own retries and retry link keep working. Paid in that time
 * (a retry, the provider's link, or a new autopay from Pay now), nothing
 * changes. Unpaid at the end, the hourly sweep moves it to Free here: the
 * subscription is CANCELLED (read as Free), cancelled at the provider, and
 * the business told; what is over Free's limits pauses 7 days after that
 * (DEC-114, `over-limit.ts`). Nothing is deleted.
 */
export const PAYMENT_DUE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date a payment that falls due now must be paid by. */
export function paymentDueFrom(now: Date): Date {
    return new Date(now.getTime() + PAYMENT_DUE_DAYS * DAY_MS);
}

const BATCH = 200;

/**
 * A month paid one payment at a time is over (stage 9, KTD5b: Global's
 * monthly route while Razorpay can't renew a USD plan on autopay): the next
 * month is due. The plan stays {@link PAYMENT_DUE_DAYS} days from the
 * month's end, the business is told once with Pay now, and Pay now is a
 * USD order for the next month, in the plan's own currency. Unpaid by then,
 * {@link closeOverduePayments} moves it to Free, as a failed renewal. The
 * caller holds the subscription's row lock.
 */
export async function openMonthDueInTx(
    tx: Prisma.TransactionClient,
    sub: { id: string; organizationId: string; currentPeriodEnd: Date },
): Promise<void> {
    const until = paymentDueFrom(sub.currentPeriodEnd);
    await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE", paymentDueUntil: until },
    });
    await enqueueBillingEmail(tx, {
        kind: "PAYMENT_FAILED",
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        eventKey: `month-due:${sub.id}:${sub.currentPeriodEnd.toISOString()}`,
        final: false,
        monthDue: true,
    });
}

/**
 * Move every business whose payment is still due past its date to Free.
 * One that fails never stops the rest. Returns how many moved.
 */
export async function closeOverduePayments(
    now: Date,
    logger: Pick<Logger, "error" | "log">,
): Promise<number> {
    let moved = 0;
    const tried = new Set<string>();
    for (;;) {
        const overdue = await prisma.subscription.findMany({
            where: {
                status: "PAST_DUE",
                paymentDueUntil: { lte: now },
                ...(tried.size ? { id: { notIn: [...tried] } } : {}),
            },
            select: { id: true },
            orderBy: { paymentDueUntil: "asc" },
            take: BATCH,
        });
        if (overdue.length === 0) break;
        for (const { id } of overdue) {
            tried.add(id);
            try {
                if (await closeOneInTx(id, now)) moved += 1;
            } catch (error) {
                logger.error(
                    `billing_payment_due_close_failed subscription=${id}: ${String(error)}`,
                );
            }
        }
        if (overdue.length < BATCH) break;
    }
    if (moved > 0) logger.log(`billing_payment_due_closed moved=${moved}`);
    return moved;
}

async function closeOneInTx(id: string, now: Date): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${id} FOR UPDATE`;
        // Re-checked under the lock: a payment that landed since is kept.
        const sub = await tx.subscription.findFirst({
            where: {
                id,
                status: "PAST_DUE",
                paymentDueUntil: { lte: now },
            },
            select: {
                id: true,
                organizationId: true,
                provider: true,
                providerSubscriptionId: true,
                paymentDueUntil: true,
            },
        });
        if (!sub) return false;
        await tx.subscription.update({
            where: { id: sub.id },
            data: { status: "CANCELLED", paymentDueUntil: null },
        });
        // Ended at the provider too, so it can never charge for a plan the
        // business no longer has.
        if (sub.provider && sub.providerSubscriptionId) {
            await enqueueProviderCancel(tx, {
                organizationId: sub.organizationId,
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                atCycleEnd: false,
            });
        }
        await enqueueBillingEmail(tx, {
            kind: "PAYMENT_FAILED",
            organizationId: sub.organizationId,
            subscriptionId: sub.id,
            eventKey: `due:${sub.id}:${sub.paymentDueUntil?.toISOString() ?? ""}`,
            final: true,
        });
        return true;
    });
}
