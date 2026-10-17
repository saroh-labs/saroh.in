import type { Prisma } from "@saroh/database";

/**
 * When the provider subscription a business is billed through starts
 * charging: its checkout's `startAt` (an upgrade's or a scheduled change's
 * charges start when the period already paid ends; a trial's when the
 * first month does), or null when it charged from the start or isn't a
 * checkout's. Read by `leavesWithCycle` (`change-timing.ts`): one whose
 * first charge is still ahead is ended at once, never "with its cycle".
 */
export async function chargesStartInTx(
    tx: Pick<Prisma.TransactionClient, "billingCheckout">,
    sub: { provider: string | null; providerSubscriptionId: string | null },
): Promise<Date | null> {
    if (!sub.provider || !sub.providerSubscriptionId) return null;
    const checkout = await tx.billingCheckout.findUnique({
        where: {
            provider_providerSubscriptionId: {
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
            },
        },
        select: { kind: true, startAt: true },
    });
    if (!checkout || checkout.kind === "NEW") return null;
    return checkout.startAt;
}
