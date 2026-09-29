import { prisma } from "@saroh/database";

import type { ChargeUnderWay } from "../payments/charge-under-way";
import type { MandateChargesService } from "../payments/mandate-charges.service";
import { effectiveChargeTiming, projectedCharge } from "./autopay-timing";

/**
 * "Next autopay charge: ‹date›" for the customer (round-2 D13B, DEC-065):
 * the account's Plan tab and the pay page say when autopay will next take
 * money, by the merchant's timing.
 *
 * - A charge queued and not yet asked for: its planned debit (`at` still
 *   ahead). One asked for already reads "Autopay charge in progress".
 * - None queued: the next renewal's, projected from the renewal date, the
 *   timing (the booked plan's, else the plan's, else the business's) and
 *   the mandate's method — only while the plan renews and its autopay can
 *   charge (an ACTIVE mandate, its provider's charging on).
 */
export async function nextAutopayCharge(
    charges: Pick<MandateChargesService, "chargeableMandate"> | undefined,
    sub: {
        id: string;
        organizationId: string;
        planId: string;
        pendingPlanId: string | null;
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: Date;
        timezone: string;
    },
    underWay: ChargeUnderWay | null,
    now: Date,
): Promise<Date | null> {
    if (underWay) return underWay.at > now ? underWay.at : null;
    if (!charges || sub.status !== "ACTIVE" || sub.cancelAtPeriodEnd) {
        return null;
    }
    const mandate = await charges.chargeableMandate(sub.organizationId, sub.id);
    if (!mandate) return null;
    const timing = await effectiveChargeTiming(
        prisma,
        sub.organizationId,
        sub.pendingPlanId ?? sub.planId,
    );
    return projectedCharge(timing, {
        renewal: sub.currentPeriodEnd,
        timezone: sub.timezone,
        method: mandate.method,
    });
}
