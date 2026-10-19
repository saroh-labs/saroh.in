import type { Prisma } from "@saroh/database";

import { reservedPhoneEmail } from "../contacts/contact-email";
import { contactByPhone, lockWalkInPhone } from "../orders/walk-in-customer";

/**
 * The contact of a booker known by their phone alone (DEC-170), on the
 * reservation's transaction: the business's contact with that phone — found
 * again under the phone's lock, so two bookings for one new number never
 * make two people — else a new one kept by it, with the reserved
 * `phone+…@phone.invalid` placeholder for an email
 * (`contacts/contact-email.ts`), which every reader treats as no email. A
 * real email typed later replaces it. The same lock and match New order
 * keeps a walk-in by (`orders/walk-in-customer.ts`).
 */
export async function phoneContactInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: { name?: string; phone?: string; key: string },
    source: string,
): Promise<{ id: string; email: string }> {
    await lockWalkInPhone(tx, organizationId, input.key);
    const id = await contactByPhone(tx, organizationId, input.key);
    if (id) {
        return tx.contact.findUniqueOrThrow({
            where: { id },
            select: { id: true, email: true },
        });
    }
    const words = (input.name ?? "").trim().split(/\s+/).filter(Boolean);
    return tx.contact.create({
        data: {
            organizationId,
            email: reservedPhoneEmail(),
            firstName: words[0] ?? null,
            lastName: words.length > 1 ? words.slice(1).join(" ") : null,
            phone: input.phone ?? null,
            source,
        },
        select: { id: true, email: true },
    });
}
