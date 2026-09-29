import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { assertBusinessDetails } from "../invoices/business-details";
import { mintPayToken } from "../invoices/pay-token";
import { assertPaymentsOn } from "../invoices/payments-on";
import { allows, authorize } from "../organizations/organization-policy";
import { payLinkProvider } from "../payments/pay-link-provider";
import { PAY_LINK_ORDER_SELECT, payLinkRefusal } from "./order-pay-link";

/**
 * "Make a pay link" and "New pay link" on Order Detail (plan B, B11).
 *
 * The link is handed to whoever makes it, once: only the token's hash is
 * kept, so `order:read` can see that a link exists and when it was made,
 * never the link. Asking again makes a new one, and the one before stops
 * working. Saroh sends nothing itself yet (A14): the address is copied.
 *
 * Only an order still owed money, at a business whose storefront can take
 * the payment online, gets one. The customer's page charges the order's
 * total less what was taken, worked out again when they pay; paying it
 * writes the order's invoice through the usual reconciliation (DEC-023), so
 * a link never pays an invoice.
 */
@Injectable()
export class OrderPayLinkService {
    /**
     * Mint the order's pay link and return its token. `order:create` or
     * `order:edit` (B16, matrix §2): whoever takes orders makes their pay
     * links, and whoever changes them makes a new one, which stops the old.
     * Another business's order is a 404; one that can't be paid, or no
     * provider to take it, a 409.
     */
    async make(
        ctx: OrganizationContext,
        orderId: string,
        now: Date = new Date(),
    ): Promise<{ token: string; payLinkCreatedAt: Date }> {
        if (!allows(ctx, "order:create") && !allows(ctx, "order:edit")) {
            // The refusal names the power that replaces a link.
            authorize(ctx, "order:edit");
        }
        await assertPaymentsOn(prisma, ctx.organizationId, "make a pay link");
        // A way to take money online: the business details first (DEC-068).
        await assertBusinessDetails(prisma, ctx.organizationId);
        return prisma.$transaction((tx) =>
            issueOrderPayLinkInTx(tx, ctx.organizationId, orderId, now),
        );
    }
}

/**
 * The pay link's one writer: Order Detail's "Make a pay link" above, and
 * New order's "Send a payment link" (B13), which makes the order and its
 * link in one transaction, so a link that can't be made makes no order.
 * The caller has authorized and checked that payments are on.
 */
export async function issueOrderPayLinkInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
    now: Date = new Date(),
): Promise<{ token: string; payLinkCreatedAt: Date }> {
    // The order's row lock: a cancel, a payment recorded by hand and a new
    // link on one order take turns.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const order = await tx.order.findFirst({
        where: { id: orderId, organizationId },
        select: PAY_LINK_ORDER_SELECT,
    });
    if (!order) throw new NotFoundException("Order not found");
    const refusal = payLinkRefusal(order);
    if (refusal) throw new ConflictException(refusal);
    // A provider that can open the checkout window, or a 409 naming what to
    // connect or fix.
    await payLinkProvider(tx, organizationId, order.storeId);

    const { token, tokenHash } = mintPayToken();
    await tx.order.update({
        where: { id: order.id },
        data: { payTokenHash: tokenHash, payLinkCreatedAt: now },
    });
    return { token, payLinkCreatedAt: now };
}
