import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { PROVIDER_ID } from "./admin-billing.service";

/**
 * Billing's one search on its queue and its provider events (R25): the
 * same words the subscriptions and invoices tabs take. A business's name
 * or slug, or a provider id (`pay_`, `sub_`, `cust_`, `order_`) that its
 * subscription, a checkout, its billing profile or an invoice carries.
 * Neither table has a relation to its business, so the search finds the
 * businesses first and the list filters on their ids.
 */

/** The most businesses one search narrows to; a name rarely matches more. */
export const SEARCHED_BUSINESSES_CAP = 200;

/** The businesses a search names, as a Prisma `where`. */
export function organizationSearch(q: string): Prisma.OrganizationWhereInput {
    if (PROVIDER_ID.test(q)) {
        return {
            OR: [
                {
                    subscription: {
                        OR: [
                            { providerSubscriptionId: q },
                            { providerCustomerId: q },
                        ],
                    },
                },
                {
                    billingCheckouts: {
                        some: {
                            OR: [
                                { providerSubscriptionId: q },
                                { providerCustomerId: q },
                            ],
                        },
                    },
                },
                { billingProfile: { providerCustomerId: q } },
                {
                    sarohInvoices: {
                        some: {
                            OR: [
                                { providerPaymentId: q },
                                { providerSubscriptionId: q },
                                { providerCustomerId: q },
                            ],
                        },
                    },
                },
            ],
        };
    }
    return {
        OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
        ],
    };
}

/**
 * The ids of the businesses a search names, or null when nothing was
 * searched for (the list is then not narrowed).
 */
export async function searchedOrganizationIds(
    raw: string | undefined,
): Promise<string[] | null> {
    const q = raw?.trim();
    if (!q) return null;
    const rows = await prisma.organization.findMany({
        where: organizationSearch(q),
        orderBy: { id: "asc" },
        take: SEARCHED_BUSINESSES_CAP,
        select: { id: true },
    });
    return rows.map((r) => r.id);
}
