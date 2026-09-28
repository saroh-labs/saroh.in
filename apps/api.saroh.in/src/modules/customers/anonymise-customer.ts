import type { Prisma } from "@saroh/database";

import { reservedRemovedEmail } from "../contacts/contact-email";

/** What Orders, Bookings and the rest call someone whose details were removed. */
export const REMOVED_CUSTOMER_NAME = "Removed customer";

/**
 * A store customer whose details were removed: its email is the removal's
 * placeholder. Not any placeholder: a walk-in kept by their phone (B13b)
 * carries `phone+…@phone.invalid` and is nobody removed.
 */
export function isRemovedStoreCustomer(
    customer: { email: string } | null | undefined,
): boolean {
    const email = customer?.email.trim().toLowerCase() ?? "";
    return email.startsWith("removed+") && email.endsWith("@removed.invalid");
}

/**
 * Anonymise storefront customers whose person asked for their details to
 * be removed (DEC-042, C11). The rows stay — an order needs its customer —
 * but their email becomes the reserved `removed+<customerId>@removed.invalid`
 * placeholder (unique per store, as the email must be) and every other
 * personal value is cleared. The placeholder is what stops C2's
 * `ensureContactForPaidOrder` or a signed-in checkout finding them by
 * email and linking them again: a later order with their old email makes a
 * new store customer.
 *
 * Their orders stay attached and read "Removed customer" wherever a name
 * would be.
 */
export async function anonymiseStoreCustomersInTx(
    tx: Prisma.TransactionClient,
    customerIds: readonly string[],
): Promise<number> {
    for (const id of customerIds) {
        await tx.customer.update({
            where: { id },
            data: {
                email: reservedRemovedEmail(id),
                firstName: null,
                lastName: null,
                phone: null,
                country: null,
                state: null,
                city: null,
                zipCode: null,
            },
            select: { id: true },
        });
    }
    return customerIds.length;
}
