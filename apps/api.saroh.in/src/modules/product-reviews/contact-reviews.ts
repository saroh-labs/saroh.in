import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { isRemovedContact } from "../customer-workspace/resolve-contact";

/**
 * Which reviews are one customer's (C6, Customer Detail's Reviews tab).
 *
 * A review belongs to a store customer, and a contact holds store customers
 * only through a confirmed identity link (`CustomerIdentityLink`). So the
 * contact's reviews are the ones written by, or invited from an order of,
 * a store customer linked to it. A store customer with the same email that
 * nobody linked is not them, and its reviews are not shown.
 *
 * A contact removed for a privacy request (C11) has no reviews to show: the
 * removal hid and scrubbed them and dropped the links, and this says so
 * again rather than rely on that. A contact in another business is a 404.
 *
 * Returns the `where` to add to the list, or null when there is nothing to
 * list (removed, or no linked store customer).
 */
export async function contactReviewsWhere(
    organizationId: string,
    contactId: string,
): Promise<Prisma.ProductReviewWhereInput | null> {
    const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { email: true, removedAt: true },
    });
    if (!contact) throw new NotFoundException("Customer not found");
    if (isRemovedContact(contact)) return null;

    const links = await prisma.customerIdentityLink.findMany({
        where: { organizationId, contactId },
        select: { customerId: true },
    });
    const customerIds = [...new Set(links.map((l) => l.customerId))];
    if (customerIds.length === 0) return null;

    return {
        OR: [
            { customerId: { in: customerIds } },
            // A review from before its customer was recorded on it: the
            // order it was invited from says whose it is.
            {
                customerId: null,
                invitation: { order: { customerId: { in: customerIds } } },
            },
        ],
    };
}
