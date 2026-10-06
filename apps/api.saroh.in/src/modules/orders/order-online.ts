import { prisma } from "@saroh/database";

import { planTakesOnlinePayment } from "../billing/online-payments-plan";
import { paymentsOn } from "../invoices/payments-on";

/**
 * Whether money still owed on an order — an edit's difference — can be
 * asked for online: the plan takes online payments
 * (`billing/online-payments-plan.ts`), Payments is on, and a provider is
 * connected to take it. When it can't, nothing is attempted online: the
 * order shows what is owed and staff record it when they are paid ("Record
 * payment", `OrderKitchenService.recordDifference`). A plan without online
 * payments isn't a failure to settle, only a business that takes its money
 * at the counter.
 */
export async function orderTakesOnline(
    organizationId: string,
): Promise<boolean> {
    const [plan, on, provider] = await Promise.all([
        planTakesOnlinePayment(organizationId),
        paymentsOn(prisma, organizationId),
        prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED" },
            select: { id: true },
        }),
    ]);
    return plan && on && provider !== null;
}
