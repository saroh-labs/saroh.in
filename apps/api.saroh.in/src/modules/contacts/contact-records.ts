import type { Prisma, PrismaClient } from "@saroh/database";

import { NOT_A_BOOKING_HOLD } from "../invoices/invoice-state";
import { realOrderWhere } from "../orders/open-orders";

/**
 * The words the API refuses a hard delete with (DEC-042), and the ones
 * Customer Detail's ⋯ menu shows beside the switched-off item
 * (`lib/customer-workspace/more-menu.ts` `DELETE_KEEPS_RECORDS`).
 */
export const DELETE_KEEPS_RECORDS =
    "They have orders or invoices. Remove their details instead.";

type Db = Pick<
    PrismaClient | Prisma.TransactionClient,
    "customerIdentityLink" | "order" | "invoice"
>;

export interface ContactRecords {
    orders: number;
    invoices: number;
}

/**
 * The orders and invoices that keep a contact's record (DEC-042): a hard
 * delete stays only for a contact with none, and a person who has them is
 * anonymised instead (privacy removal, C11), because the law needs the paper.
 *
 * The same set Customer Detail shows (`customer-detail.service.ts`), so the
 * menu and the API agree: real orders (never an abandoned site checkout)
 * placed through a store customer linked to the contact, and invoices billed
 * to the contact or to one of those orders — a pay-now hold's unnumbered
 * draft is not paper, and does not count.
 */
export async function contactRecords(
    db: Db,
    organizationId: string,
    contactId: string,
): Promise<ContactRecords> {
    const links = await db.customerIdentityLink.findMany({
        where: { organizationId, contactId },
        select: { customerId: true },
    });
    const customerIds = links.map((l) => l.customerId);
    const [orders, invoices] = await Promise.all([
        customerIds.length > 0
            ? db.order.count({
                  where: {
                      customerId: { in: customerIds },
                      ...realOrderWhere(),
                  },
              })
            : Promise.resolve(0),
        db.invoice.count({
            where: {
                organizationId,
                ...NOT_A_BOOKING_HOLD,
                OR: [
                    { contactId },
                    ...(customerIds.length > 0
                        ? [{ order: { customerId: { in: customerIds } } }]
                        : []),
                ],
            },
        }),
    ]);
    return { orders, invoices };
}

export function keepsRecords(records: ContactRecords): boolean {
    return records.orders > 0 || records.invoices > 0;
}
