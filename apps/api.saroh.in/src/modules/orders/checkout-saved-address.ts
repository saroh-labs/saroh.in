import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { CustomerContext } from "../site-accounts/customer-context.decorator";

/**
 * Where this customer's last delivery went, for the bag to offer again:
 * `GET public/sites/:siteId/checkout/address`.
 *
 * Nothing new is stored. The address a customer typed is already on the
 * order it was for, and the order names the account that placed it
 * (`customerAccountId`, A7), so the last one is read from there:
 *
 * - **Theirs alone.** Behind the customer session for this very site, and
 *   only an order this account placed online.
 * - **Only an order that stands.** One still being paid or closed unpaid
 *   was never placed (B1), and its address is not offered.
 * - **Gone when the order's is.** A privacy removal or the retention sweep
 *   clears an order's delivery lines; nothing here outlives them.
 *
 * A session for another site, an account with no delivery yet, and an
 * address that was cleared all answer `{ address: null }` or 404 alike:
 * the bag then asks for one, as it always has.
 */

export interface SavedAddress {
    name: string | null;
    phone: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
}

/** What the read selects, and all {@link savedAddressOf} needs. */
export interface SavedAddressRow {
    deliveryName: string | null;
    deliveryPhone: string | null;
    deliveryLine1: string | null;
    deliveryLine2: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryPostalCode: string | null;
}

const clean = (value: string | null | undefined): string | null => {
    const t = value?.trim();
    if (!t) return null;
    return t;
};

/**
 * The address on an order, or null when any part a delivery needs is
 * missing: half an address is never offered. Pure.
 */
export function savedAddressOf(
    row: SavedAddressRow | null | undefined,
): SavedAddress | null {
    if (!row) return null;
    const line1 = clean(row.deliveryLine1);
    const city = clean(row.deliveryCity);
    const state = clean(row.deliveryState);
    const postalCode = clean(row.deliveryPostalCode);
    if (!line1 || !city || !state || !postalCode) return null;
    return {
        name: clean(row.deliveryName),
        phone: clean(row.deliveryPhone),
        line1,
        line2: clean(row.deliveryLine2),
        city,
        state,
        postalCode,
    };
}

/** Placed: paid, or paid and refunded since (never a refused checkout). */
const PLACED = ["PAID", "REFUNDED"];

@Injectable()
export class CheckoutSavedAddressService {
    /** The address of the last delivery this customer placed here. */
    async lastAddress(
        siteId: string,
        customer: CustomerContext,
    ): Promise<{ address: SavedAddress | null }> {
        // A session for another site is no session here.
        if (customer.siteId !== siteId) throw new NotFoundException();
        const row = await runInOrgContext(customer.organizationId, () =>
            prisma.order.findFirst({
                where: {
                    organizationId: customer.organizationId,
                    customerAccountId: customer.accountId,
                    placedOnline: true,
                    deliveryLine1: { not: null },
                    OR: [
                        { paymentStatus: { in: PLACED } },
                        { payOnHandover: true },
                    ],
                },
                orderBy: { createdAt: "desc" },
                select: {
                    deliveryName: true,
                    deliveryPhone: true,
                    deliveryLine1: true,
                    deliveryLine2: true,
                    deliveryCity: true,
                    deliveryState: true,
                    deliveryPostalCode: true,
                },
            }),
        );
        return { address: savedAddressOf(row) };
    }
}
