import type { Prisma } from "@saroh/database";

import { resolveContact } from "./resolve-contact";

/**
 * A phone the customer gave themselves — on the booking page, or at the
 * site's checkout — fills their contact when it has none (UX-049). One the
 * business already has is never replaced from a customer's page.
 */

/** The phone to fill `current` with: the given one, trimmed, or null. */
export function phoneToFill(
    given: string | null | undefined,
    current: string | null | undefined,
): string | null {
    const phone = given?.trim();
    return phone && !current?.trim() ? phone : null;
}

/**
 * {@link phoneToFill} on a contact this transaction hasn't read: through
 * `resolveContact` (C9), so a write racing a merge fills the survivor, and
 * only while it still has no phone, so one staff gave meanwhile stands.
 * Whether it was filled.
 */
export async function fillContactPhoneInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    contactId: string,
    given: string | null | undefined,
): Promise<boolean> {
    const phone = phoneToFill(given, null);
    if (!phone) return false;
    const resolved = await resolveContact(tx, contactId, organizationId);
    if (!resolved || resolved.removed) return false;
    const { count } = await tx.contact.updateMany({
        where: {
            id: resolved.id,
            organizationId,
            OR: [{ phone: null }, { phone: "" }],
        },
        data: { phone },
    });
    return count > 0;
}
