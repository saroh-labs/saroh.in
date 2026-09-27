/**
 * The reserved placeholder emails a Contact can carry, and how every reader
 * of `Contact.email` treats them (DEC-049, round-2 plan A, A1).
 *
 * `Contact.email` is required and unique per business, so a contact that must
 * not hold a real address still needs one. Three cases give it a reserved,
 * undeliverable placeholder built from its own id:
 *
 * - `account+<contactId>@account.invalid` — a site account's separate
 *   contact, made because another contact already held the verified email
 *   (A4). The real address lives on `CustomerAccount.email`.
 * - `merged+<contactId>@removed.invalid` — the contact a merge retired (C9).
 * - `removed+<contactId>@removed.invalid` — a contact whose details were
 *   removed for privacy (C11).
 *
 * `.invalid` is reserved by RFC 2606 and never resolves, so nothing can be
 * delivered to these even by mistake. Still, every reader goes through this
 * module and treats a placeholder as "no email": lists and details show the
 * account's email or nothing, duplicate suggestions never pair on it, and
 * communications refuse to send to it. This is the one owner of the shapes;
 * C2, C8, C9, C11 and communications import it and keep no copy.
 */

/** The domains every reserved placeholder is built on. */
export const RESERVED_CONTACT_EMAIL_DOMAINS = [
    "account.invalid",
    "removed.invalid",
] as const;

/** A site account's separate contact (A4, DEC-049). */
export function reservedAccountEmail(contactId: string): string {
    return `account+${contactId}@account.invalid`;
}

/** The contact a merge retired (C9). */
export function reservedMergedEmail(contactId: string): string {
    return `merged+${contactId}@removed.invalid`;
}

/** A contact removed for privacy (C11). */
export function reservedRemovedEmail(contactId: string): string {
    return `removed+${contactId}@removed.invalid`;
}

/**
 * True when `email` is one of the reserved placeholders, recognised by its
 * domain (case and surrounding space ignored). An empty or missing value is
 * not a placeholder: it is simply no email.
 */
export function isReservedContactEmail(
    email: string | null | undefined,
): boolean {
    if (!email) return false;
    const at = email.lastIndexOf("@");
    if (at < 0) return false;
    const domain = email
        .slice(at + 1)
        .trim()
        .toLowerCase();
    return (RESERVED_CONTACT_EMAIL_DOMAINS as readonly string[]).includes(
        domain,
    );
}

/**
 * The email to show (or use) for a contact: its own email, unless that is a
 * placeholder, in which case the email of the site account linked to it, or
 * null when there is none. Never returns a placeholder.
 */
export function contactEmailForDisplay(
    contactEmail: string | null | undefined,
    accountEmail?: string | null,
): string | null {
    if (contactEmail && !isReservedContactEmail(contactEmail)) {
        return contactEmail;
    }
    if (accountEmail && !isReservedContactEmail(accountEmail)) {
        return accountEmail;
    }
    return null;
}
