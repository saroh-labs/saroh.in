import type { Prisma } from "@saroh/database";

import { isReservedContactEmail } from "../contacts/contact-email";

/**
 * The one address a customer notice for a contact goes to (DEC-174 D1, U2
 * #1133): the contact's own email, so a customer booked at the desk, on
 * the phone or as a guest hears too, not only one with a site account.
 *
 * A2: a live site account's verified email wins over the contact's, when
 * the contact has one (the account is the address they proved, and a
 * contact's own may be a reserved placeholder, DEC-049). A placeholder is
 * never an address. Never an address a caller typed.
 *
 * Read by the send path (`queueTransactional`'s CONTACT recipient) and by
 * the reach the screens show (`notice-reach.ts`), so "Emailed to ‹email›"
 * is always where it goes.
 */
export async function contactNoticeAddress(
    db: Pick<Prisma.TransactionClient, "customerAccount" | "contact">,
    organizationId: string,
    contactId: string,
): Promise<string | null> {
    const account = await db.customerAccount.findFirst({
        where: { organizationId, contactId, status: "ACTIVE" },
        orderBy: { linkedAt: "desc" },
        select: { email: true },
    });
    const verified = account?.email.trim();
    if (verified) return verified;
    const contact = await db.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { email: true },
    });
    const own = contact?.email.trim();
    return own && !isReservedContactEmail(own) ? own : null;
}
