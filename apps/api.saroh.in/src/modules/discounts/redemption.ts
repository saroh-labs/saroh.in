import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { fromMinor } from "../../common/money";
import type { AppliedDiscount } from "./discounts.service";

/**
 * The redemption, inside the order's own transaction: a failed order
 * leaves none behind, and the unique order id keeps a retried create
 * from counting twice. It snapshots the rule it applied, so re-rating
 * the code later cannot rewrite this order's history.
 *
 * One writer for every order that uses a code — the counter's and the
 * site's checkout (DEC-104) — so a code's uses are one count wherever
 * they were taken. The caller runs the transaction Serializable: the
 * re-count below must see a concurrent redemption of the last use.
 */
export async function recordRedemptionInTx(
    tx: Prisma.TransactionClient,
    applied: AppliedDiscount,
    orderId: string,
    organizationId: string | null,
    currency: string,
): Promise<void> {
    if (!organizationId) {
        // The code check already refused this; the type needs saying so.
        throw new BadRequestException("A code needs a business");
    }
    if (applied.usageLimit !== null) {
        // Re-counted INSIDE the serializable transaction, so two orders
        // racing for the last use cannot both see room for it.
        const used = await tx.discountRedemption.count({
            where: { discountId: applied.discountId },
        });
        if (used >= applied.usageLimit) {
            throw new ConflictException({
                message: `${applied.code} has been used as many times as it allows.`,
                details: { field: "discountCode" },
            });
        }
    }
    await tx.discountRedemption.create({
        data: {
            organizationId,
            discountId: applied.discountId,
            orderId,
            amount: fromMinor(applied.amountCents),
            currency,
            code: applied.code,
            kind: applied.kind,
            percentBps: applied.percentBps,
            ruleAmount: applied.ruleAmount,
        },
    });
}
