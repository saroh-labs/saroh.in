import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { realOrderWhere } from "../orders/open-orders";
import type { CustomerContext } from "./customer-context.decorator";
import type { AccountOrder, AccountOrderDetail } from "./customer-view";
import { ORDER_ROW_ITEMS, orderDetailView, orderView } from "./customer-view";

/**
 * The account's Orders and each order's Track (round-2 plan A, A7;
 * ADR-011).
 *
 * A customer's orders are:
 * - those of every store customer linked to their contact (C2's identity
 *   links: confirmed by staff, or made by a payment, a booking or a
 *   signed-in checkout), and
 * - those the account placed itself while signed in (`Order.
 *   customerAccountId`: the site's checkout, G13, or a treatment booked
 *   signed in), even when that store customer stands for someone else.
 *
 * Never an abandoned or unpaid site checkout (`realOrderWhere`, B1): until
 * it is paid it is not an order. Every read is scoped to the signed-in
 * customer's business, and another customer's order — even in the same
 * business — is a 404. Everything leaves through `customer-view.ts`.
 */

type Ctx = Pick<CustomerContext, "organizationId" | "contactId" | "accountId">;

/** How many orders the Orders tab lists, newest first. */
export const ORDER_ROWS = 50;

/**
 * The orders a signed-in customer may see, as a Prisma `where`. Home's
 * latest orders read it too, so the two never disagree.
 */
export async function ownOrdersWhere(
    ctx: Ctx,
    db: Pick<Prisma.TransactionClient, "customerIdentityLink"> = prisma,
): Promise<Prisma.OrderWhereInput> {
    const links = await db.customerIdentityLink.findMany({
        where: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
        },
        select: { customerId: true },
    });
    const mine: Prisma.OrderWhereInput[] = [
        { customerAccountId: ctx.accountId },
    ];
    if (links.length > 0) {
        mine.push({ customerId: { in: links.map((l) => l.customerId) } });
    }
    return {
        organizationId: ctx.organizationId,
        OR: mine,
        // Never an abandoned site checkout (B1).
        AND: [realOrderWhere()],
    };
}

/** What an order row reads, for the list and Home alike. */
export const ORDER_ROW_SELECT = {
    id: true,
    orderId: true,
    createdAt: true,
    total: true,
    currency: true,
    status: true,
    paymentStatus: true,
    stage: true,
    fulfilment: true,
    _count: { select: { items: true } },
    items: {
        take: ORDER_ROW_ITEMS,
        orderBy: { id: "asc" },
        select: {
            quantity: true,
            product: { select: { name: true } },
            service: { select: { name: true } },
        },
    },
} as const satisfies Prisma.OrderSelect;

/** The customer's orders, newest first. */
export async function readOrders(
    ctx: Ctx,
    take: number = ORDER_ROWS,
): Promise<AccountOrder[]> {
    const rows = await prisma.order.findMany({
        where: await ownOrdersWhere(ctx),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: ORDER_ROW_SELECT,
    });
    return rows.map(orderView);
}

@Injectable()
export class AccountOrdersService {
    /** The Orders tab: every order of the customer's, newest first. */
    list(ctx: Ctx): Promise<AccountOrder[]> {
        return readOrders(ctx);
    }

    /** One order with its Track. Another customer's is a 404. */
    async detail(ctx: Ctx, orderRef: string): Promise<AccountOrderDetail> {
        const row = await prisma.order.findFirst({
            where: { AND: [{ id: orderRef }, await ownOrdersWhere(ctx)] },
            select: {
                id: true,
                orderId: true,
                createdAt: true,
                total: true,
                currency: true,
                status: true,
                paymentStatus: true,
                stage: true,
                fulfilment: true,
                courierName: true,
                trackingNumber: true,
                trackingUrl: true,
                items: {
                    orderBy: { id: "asc" },
                    select: {
                        quantity: true,
                        productId: true,
                        serviceId: true,
                        product: { select: { name: true } },
                        service: { select: { name: true, visits: true } },
                    },
                },
                // A treatment's visits (E9): only when, where in the list,
                // and how it went — never who else was there or staff notes.
                bookings: {
                    where: { visitNumber: { not: null } },
                    orderBy: [{ visitNumber: "asc" }, { startAt: "asc" }],
                    select: {
                        visitNumber: true,
                        startAt: true,
                        timezone: true,
                        status: true,
                        outcome: true,
                    },
                },
                // Its receipt: the paid invoice that bills it (U5), or a
                // treatment's booking invoice that names it (E9).
                invoices: {
                    where: {
                        kind: "INVOICE",
                        status: "PAID",
                        number: { not: null },
                    },
                    orderBy: { issuedAt: "desc" },
                    take: 1,
                    select: { id: true },
                },
            },
        });
        if (!row) throw new NotFoundException();
        return orderDetailView(row);
    }
}
