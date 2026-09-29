import type { Prisma } from "@saroh/database";

import { normaliseEmail } from "./duplicates";
import { resolveContact } from "./resolve-contact";

/**
 * Customers who share an email, linked on their own where the storefront
 * says so (DEC-055, C15).
 *
 * C2's rule (`linkPayingCustomer`) leaves a paying store customer unlinked
 * when a contact already holds their email, and suggests the pair to staff.
 * Each storefront can instead ask for that customer to be linked to the
 * contact straight away (`StoreSettings.linkSameEmailSince`). This runs
 * after C2's rule has said "suggested", in the same transaction and
 * savepoint (`ensure-contact.ts`), and links only when every one of these
 * holds; otherwise the pair stays a suggestion, as before:
 *
 * - **the incoming customer's own storefront has it on**, and the store
 *   customer was made after it was turned on — a pair that existed before
 *   is never re-linked by turning it on;
 * - **a contact holds the email** (not only a site account), and C9's
 *   `resolveContact` finds it live: a tombstone resolves to its survivor, a
 *   contact removed for privacy (C11) is never a target;
 * - **that contact was itself made from a store customer**
 *   (`source: store-customer:<id>`, C2) — never one staff entered, an
 *   enquiry's or a lead's;
 * - **no site account would see more than it proved** (DEC-049): a contact
 *   with a site account takes the link only when its email is verified,
 *   and a site account on another contact signing in with this email means
 *   the pair is for staff.
 *
 * The link is a PAYMENT link with no team member on it, like C2's own:
 * it was made when they paid.
 */

/** Why a same-email customer was or wasn't linked. */
export type SameEmailOutcome =
    | "linked"
    /** The storefront leaves them for staff (the default). */
    | "off"
    /** The store customer is older than the setting: an existing pair. */
    | "existing-pair"
    /** No contact holds the email (a site account alone does), or none usable. */
    | "no-contact"
    /** The contact was removed for privacy (C11). */
    | "removed"
    /** The contact wasn't made from a store customer (DEC-055). */
    | "not-store-customer"
    /** Linking would widen a site account's view past a verified email. */
    | "unverified";

type Tx = Prisma.TransactionClient;

const STORE_CUSTOMER_SOURCE = "store-customer:";

/** Whether a contact was made from a store customer (C2's `source`). */
export function madeFromStoreCustomer(source: string | null): boolean {
    return Boolean(source?.startsWith(STORE_CUSTOMER_SOURCE));
}

/** A storefront's setting as the API reads and writes it. */
export function linksSameEmail(
    settings: {
        linkSameEmailSince: Date | null;
    } | null,
): boolean {
    return Boolean(settings?.linkSameEmailSince);
}

/**
 * Link one paying store customer to the contact that holds their email,
 * when the rules above allow it. The caller has run C2's rule and been
 * told "suggested"; this re-reads what it needs under the same
 * transaction.
 */
export async function linkSameEmailCustomer(
    tx: Tx,
    input: { organizationId: string; customerId: string },
): Promise<SameEmailOutcome> {
    const { organizationId, customerId } = input;

    const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
        select: {
            email: true,
            createdAt: true,
            store: {
                select: { settings: { select: { linkSameEmailSince: true } } },
            },
        },
    });
    const since = customer?.store.settings?.linkSameEmailSince ?? null;
    if (!customer || !since) return "off";
    if (customer.createdAt < since) return "existing-pair";

    const email = normaliseEmail(customer.email);
    if (!email) return "no-contact";

    const holder = await tx.contact.findFirst({
        where: {
            organizationId,
            email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
    });
    if (!holder) return "no-contact";

    // C9: the one way to turn a contact id into the contact to write
    // against. It holds the row FOR SHARE against a merge until this
    // transaction ends.
    const resolved = await resolveContact(tx, holder.id, organizationId);
    if (!resolved) return "no-contact";
    if (resolved.removed) return "removed";

    const target = await tx.contact.findUniqueOrThrow({
        where: { id: resolved.id },
        select: {
            source: true,
            emailVerifiedAt: true,
            removedAt: true,
            customerAccounts: {
                where: { status: { in: ["ACTIVE", "BLOCKED"] } },
                select: { id: true },
            },
        },
    });
    if (target.removedAt) return "removed";
    if (!madeFromStoreCustomer(target.source)) return "not-store-customer";

    // DEC-049: the link puts this customer's orders in front of whoever
    // signs in as the contact, so only an email they proved may do that.
    if (target.customerAccounts.length > 0 && !target.emailVerifiedAt) {
        return "unverified";
    }
    // Someone signs in with this email on another contact (A4's separate
    // contact): which of the two this customer is, staff decide.
    const elsewhere = await tx.customerAccount.findFirst({
        where: {
            organizationId,
            email,
            status: { not: "REMOVED" },
            contactId: { not: resolved.id },
        },
        select: { id: true },
    });
    if (elsewhere) return "unverified";

    await tx.customerIdentityLink.createMany({
        data: [
            {
                organizationId,
                contactId: resolved.id,
                customerId,
                reason: "PAYMENT",
                linkedByUserId: null,
            },
        ],
        skipDuplicates: true,
    });
    return "linked";
}
