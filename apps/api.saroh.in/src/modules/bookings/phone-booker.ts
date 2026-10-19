import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import { reservedPhoneEmail } from "../contacts/contact-email";
import { contactByPhone, lockWalkInPhone } from "../orders/walk-in-customer";

/**
 * This phone's contact was made after the reservation's snapshot: the
 * reservation must run again (`reservation.ts` treats it as a lost race).
 */
export class PhoneSeenLate extends Error {
    constructor() {
        super("phone contact made after the reservation's snapshot");
    }
}

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
    if (!id && (await committedContactByPhone(organizationId, input.key))) {
        // The reservation's snapshot (Serializable) was taken before the
        // lock was ours: a walk-in order (Read Committed, so out of SSI's
        // sight) made this phone's contact in between. Read fresh, it is
        // there; the reservation is tried again on a new snapshot rather
        // than make a second contact for one phone.
        throw new PhoneSeenLate();
    }
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

/**
 * The phone's contact as committed now, read on a connection of its own:
 * outside the reservation's transaction (which the ambient client would
 * otherwise join) and its snapshot. Still this business's only: the query
 * names the organization.
 */
function committedContactByPhone(
    organizationId: string,
    key: string,
): Promise<string | null> {
    return outsideOrgContext(() => contactByPhone(prisma, organizationId, key));
}
