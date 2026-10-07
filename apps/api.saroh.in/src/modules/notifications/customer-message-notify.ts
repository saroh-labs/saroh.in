import type { Prisma } from "@saroh/database";

/**
 * A customer's message reaches the team (UX-014): what the thread's writer
 * queues, inside its own transaction, so a committed message always has
 * its notice (the transactional outbox). `customer-message-notify.handler.ts`
 * turns it into one inbox notice and an email to the owners and admins.
 *
 * Plain functions over the caller's transaction, as `team-alerts.ts`: the
 * site-accounts module raises it without importing this module.
 *
 * Only the first message of a turn is told: one written after the team
 * last answered (a STAFF message) or last opened the thread. Later
 * messages in the same turn land in the thread the team is already being
 * pointed at; telling each one would fill the bell and the inbox
 * (`backend-jobs.md`: never enqueue a job the handler will no-op on).
 */

/** The job type. */
export const CUSTOMER_MESSAGE_NOTIFY_TYPE = "customer-message.notify";

/** The inbox notice type the job writes. */
export const MESSAGE_NEW_NOTIFICATION_TYPE = "message.new";

/** Ids only: the handler reads the rest when it runs. */
export interface CustomerMessageNotifyPayload {
    messageId: string;
}

type Tx = Pick<Prisma.TransactionClient, "job" | "customerThreadMessage">;

/** When the team last attended to a thread, as {@link opensATurn} reads it. */
export interface TeamAttention {
    /** The team's newest message in the thread, if any. */
    lastStaffAt: Date | null;
    /** When the team last opened it (`CustomerThread.staffReadAt`). */
    staffReadAt: Date | null;
}

/** The later of the team's last answer and last open, or null for never. */
export function attendedAt(attention: TeamAttention): Date | null {
    const { lastStaffAt, staffReadAt } = attention;
    if (!lastStaffAt) return staffReadAt;
    if (!staffReadAt) return lastStaffAt;
    return lastStaffAt > staffReadAt ? lastStaffAt : staffReadAt;
}

/**
 * Whether the customer message just written opens a turn: no earlier
 * customer message waits since the team last attended to the thread.
 * `earlierWaiting` counts the customer's messages after that point,
 * the new one left out.
 */
export function opensATurn(earlierWaiting: number): boolean {
    return earlierWaiting === 0;
}

/**
 * Queue the notice for a customer message just written on `tx`, when it
 * opens a turn. `staffReadAt` is the thread's mark as read before this
 * message was appended.
 */
export async function enqueueCustomerMessageNotice(
    tx: Tx,
    input: {
        organizationId: string;
        threadId: string;
        messageId: string;
        createdAt: Date;
        staffReadAt: Date | null;
    },
): Promise<boolean> {
    const lastStaff = await tx.customerThreadMessage.findFirst({
        where: { threadId: input.threadId, author: "STAFF" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    const since = attendedAt({
        lastStaffAt: lastStaff?.createdAt ?? null,
        staffReadAt: input.staffReadAt,
    });
    const earlierWaiting = await tx.customerThreadMessage.count({
        where: {
            threadId: input.threadId,
            author: "CUSTOMER",
            id: { not: input.messageId },
            createdAt: {
                lte: input.createdAt,
                ...(since ? { gt: since } : {}),
            },
        },
    });
    if (!opensATurn(earlierWaiting)) return false;
    const payload: CustomerMessageNotifyPayload = {
        messageId: input.messageId,
    };
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: CUSTOMER_MESSAGE_NOTIFY_TYPE,
            payload: { ...payload },
        },
    });
    return true;
}
