import { isReservedContactEmail } from "../contacts/contact-email";

/**
 * Who is likely the same person (DEC-041, C2). Pure: no database, no
 * Nest. The suggestions endpoint, the customers list's "Possible duplicate"
 * (C3), the new-booking search (E4), the treatment email rule (E9) and New
 * order's customer helper (B13) all import it, and none keeps its own
 * normaliser.
 *
 * Saroh only suggests; it never merges or links on its own. A pair is made on
 * an exact normalised email or phone, never on a name.
 *
 * - **Email.** Lower-cased and trimmed. A reserved placeholder
 *   (`contacts/contact-email.ts`: a site account's separate contact, a
 *   merge's tombstone, a privacy removal) is no email and never pairs.
 * - **Phone.** Digits only, with the leading 91 of an Indian number dropped,
 *   so "+91 98765 43210" and "98765-43210" meet. Fewer than seven digits is
 *   not a phone anyone can be matched on.
 * - **A site account guards the phone.** A phone typed in the customer's own
 *   account is proven by nothing, so a phone-only pair where either side
 *   signs in is never suggested: someone who types another person's phone
 *   must not be offered as their duplicate (security review). Staff can still
 *   merge such a pair on purpose.
 * - **A pair staff split stays split.** When "This isn't them" moves an
 *   account off a contact, the account records that contact
 *   (`CustomerAccount.unlinkedFromContactId`, A1) and the two never pair
 *   again, on anything.
 */

/** What a pair was found on. */
export type MatchedOn = "email" | "phone";

/** A contact as the pairing reads it. */
export interface ContactIdentity {
    id: string;
    /** `Contact.email` as stored; a reserved placeholder counts as none. */
    email: string | null;
    phone: string | null;
    /**
     * The contact's live site account (ACTIVE or BLOCKED), or null. Its
     * email is the one the customer proved with a code.
     */
    account?: { email: string | null } | null;
    /**
     * Contacts this one must never be paired with: the contacts its accounts
     * were moved off ("This isn't them"), and the contacts whose accounts
     * were moved off it.
     */
    unlinkedFrom?: readonly string[];
}

/** A storefront's customer (`Customer`) as the pairing reads it. */
export interface StoreCustomerIdentity {
    id: string;
    email: string | null;
    phone: string | null;
}

export interface DuplicateMatch {
    id: string;
    matchedOn: MatchedOn[];
}

/** Shortest run of digits treated as a phone. */
const MIN_PHONE_DIGITS = 7;

/**
 * The email as it is compared: trimmed and lower-cased. Null for no email,
 * a blank, or a reserved placeholder.
 */
export function normaliseEmail(
    email: string | null | undefined,
): string | null {
    if (!email) return null;
    const value = email.trim().toLowerCase();
    if (!value || isReservedContactEmail(value)) return null;
    return value;
}

/**
 * The phone as it is compared: digits only, the leading 91 of a twelve-digit
 * Indian number dropped. Null for no phone or fewer than seven digits.
 */
export function normalisePhone(
    phone: string | null | undefined,
): string | null {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
        digits = digits.slice(2);
    }
    return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

/** Every email a contact can be matched on: its own and its account's. */
function emailsOf(contact: ContactIdentity): Set<string> {
    const out = new Set<string>();
    const own = normaliseEmail(contact.email);
    if (own) out.add(own);
    const account = normaliseEmail(contact.account?.email);
    if (account) out.add(account);
    return out;
}

const signsIn = (contact: ContactIdentity) => contact.account != null;

function splitByStaff(a: ContactIdentity, b: ContactIdentity): boolean {
    return (
        (a.unlinkedFrom ?? []).includes(b.id) ||
        (b.unlinkedFrom ?? []).includes(a.id)
    );
}

/**
 * Why two contacts are likely one person, or `[]` when they are not a pair.
 *
 * Email: either's own email or account email equals the other's. (Two
 * contacts' own emails can't be equal — `Contact.email` is unique per
 * business — except in case, which is compared away here.) Phone: equal,
 * and neither signs in on the business's site.
 */
export function pairContacts(
    a: ContactIdentity,
    b: ContactIdentity,
): MatchedOn[] {
    if (a.id === b.id || splitByStaff(a, b)) return [];
    const matchedOn: MatchedOn[] = [];
    const emails = emailsOf(b);
    if ([...emailsOf(a)].some((e) => emails.has(e))) matchedOn.push("email");
    if (!signsIn(a) && !signsIn(b)) {
        const phone = normalisePhone(a.phone);
        if (phone && phone === normalisePhone(b.phone)) matchedOn.push("phone");
    }
    return matchedOn;
}

/**
 * Why a store customer is likely this contact, or `[]`. Email: the store
 * customer's equals the contact's own or its account's. Phone: equal, and
 * the contact doesn't sign in on the business's site (the same guard as
 * between contacts: an account's phone is unproven).
 */
export function matchStoreCustomer(
    contact: ContactIdentity,
    customer: StoreCustomerIdentity,
): MatchedOn[] {
    const matchedOn: MatchedOn[] = [];
    const email = normaliseEmail(customer.email);
    if (email && emailsOf(contact).has(email)) matchedOn.push("email");
    if (!signsIn(contact)) {
        const phone = normalisePhone(contact.phone);
        if (phone && phone === normalisePhone(customer.phone)) {
            matchedOn.push("phone");
        }
    }
    return matchedOn;
}

/** The contacts among `candidates` that pair with `contact`, in their order. */
export function duplicatesOf(
    contact: ContactIdentity,
    candidates: readonly ContactIdentity[],
): DuplicateMatch[] {
    const out: DuplicateMatch[] = [];
    for (const candidate of candidates) {
        const matchedOn = pairContacts(contact, candidate);
        if (matchedOn.length > 0) out.push({ id: candidate.id, matchedOn });
    }
    return out;
}

/** The store customers among `candidates` that match `contact`, in order. */
export function storeCustomerMatches(
    contact: ContactIdentity,
    candidates: readonly StoreCustomerIdentity[],
): DuplicateMatch[] {
    const out: DuplicateMatch[] = [];
    for (const candidate of candidates) {
        const matchedOn = matchStoreCustomer(contact, candidate);
        if (matchedOn.length > 0) out.push({ id: candidate.id, matchedOn });
    }
    return out;
}

/**
 * Every pair within a set of contacts, each once (the lower index first). For
 * a list that flags "Possible duplicate" on a page of rows (C3): O(n²), so
 * give it the candidates a query already narrowed, not a whole business.
 */
export function pairsAmong(
    contacts: readonly ContactIdentity[],
): { a: string; b: string; matchedOn: MatchedOn[] }[] {
    const out: { a: string; b: string; matchedOn: MatchedOn[] }[] = [];
    contacts.forEach((a, i) => {
        for (const b of contacts.slice(i + 1)) {
            const matchedOn = pairContacts(a, b);
            if (matchedOn.length > 0) out.push({ a: a.id, b: b.id, matchedOn });
        }
    });
    return out;
}
