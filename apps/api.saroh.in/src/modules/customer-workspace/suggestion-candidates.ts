import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { contactEmailForDisplay } from "../contacts/contact-email";
import type { ContactIdentity, StoreCustomerIdentity } from "./duplicates";
import { normaliseEmail, normalisePhone } from "./duplicates";

/**
 * The database side of duplicate suggestions (C2): which rows could pair
 * with a contact, loaded in the shape `duplicates.ts` pairs. The queries only
 * narrow; `duplicates.ts` decides. So a query may return a row that doesn't
 * pair (a phone that shares its last seven digits), never miss one that does.
 */

type Db = typeof prisma;

/** How many candidates of each kind a suggestion reads. */
const CANDIDATE_CAP = 50;

/** Account states that sign in: a MERGED account sits on a tombstone. */
const LIVE_ACCOUNT = ["ACTIVE", "BLOCKED"] as const;

export interface LoadedContact extends ContactIdentity {
    name: string | null;
    /** The email to show: never a placeholder (`contact-email.ts`). */
    displayEmail: string | null;
}

/** Contacts by id, with their site account and the pairs staff split. */
export async function loadContactIdentities(
    db: Db,
    organizationId: string,
    ids: readonly string[],
): Promise<LoadedContact[]> {
    if (ids.length === 0) return [];
    const rows = await db.contact.findMany({
        where: { organizationId, id: { in: [...ids] } },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            customerAccounts: {
                where: { status: { not: "REMOVED" } },
                select: {
                    email: true,
                    status: true,
                    unlinkedFromContactId: true,
                },
            },
            unlinkedCustomerAccounts: { select: { contactId: true } },
        },
    });
    return rows.map((row) => {
        const live = row.customerAccounts.find((a) =>
            (LIVE_ACCOUNT as readonly string[]).includes(a.status),
        );
        const unlinkedFrom = [
            ...row.customerAccounts.map((a) => a.unlinkedFromContactId),
            ...row.unlinkedCustomerAccounts.map((a) => a.contactId),
        ].filter((id): id is string => id != null);
        return {
            id: row.id,
            email: row.email,
            phone: row.phone,
            account: live ? { email: live.email } : null,
            unlinkedFrom,
            name:
                [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
            displayEmail: contactEmailForDisplay(row.email, live?.email),
        };
    });
}

/** The real emails a contact can be found by: its own and its account's. */
function emailsOf(contact: ContactIdentity): string[] {
    return [
        ...new Set(
            [
                normaliseEmail(contact.email),
                normaliseEmail(contact.account?.email),
            ].filter((e): e is string => e != null),
        ),
    ];
}

/** The last seven digits a stored phone must end in to possibly match. */
function phoneTail(contact: ContactIdentity): string | null {
    if (contact.account) return null; // a phone-only pair needs no account
    const phone = normalisePhone(contact.phone);
    return phone ? phone.slice(-7) : null;
}

/** Other contacts that might pair with `me`, loaded for `duplicatesOf`. */
export async function contactCandidates(
    db: Db,
    organizationId: string,
    me: ContactIdentity,
): Promise<LoadedContact[]> {
    const emails = emailsOf(me);
    const tail = phoneTail(me);
    const ids = new Set<string>();

    if (emails.length > 0) {
        const byEmail = await db.contact.findMany({
            where: {
                organizationId,
                id: { not: me.id },
                OR: [
                    ...emails.map((email) => ({
                        email: { equals: email, mode: "insensitive" as const },
                    })),
                    {
                        customerAccounts: {
                            some: {
                                email: { in: emails },
                                status: { in: [...LIVE_ACCOUNT] },
                            },
                        },
                    },
                ],
            },
            select: { id: true },
            take: CANDIDATE_CAP,
        });
        for (const row of byEmail) ids.add(row.id);
    }
    if (tail) {
        const byPhone = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM "Contact"
            WHERE "organizationId" = ${organizationId}
              AND id <> ${me.id}
              AND phone IS NOT NULL
              AND right(regexp_replace(phone, '\\D', '', 'g'), 7) = ${tail}
            ORDER BY "createdAt" ASC
            LIMIT ${CANDIDATE_CAP}`);
        for (const row of byPhone) ids.add(row.id);
    }
    return loadContactIdentities(db, organizationId, [...ids]);
}

export interface LoadedStoreCustomer extends StoreCustomerIdentity {
    name: string;
}

/**
 * Store customers that might be `me`, not yet linked to it. A store
 * customer linked to another contact is still offered: which contact is
 * the person is for staff to say.
 */
export async function storeCustomerCandidates(
    db: Db,
    organizationId: string,
    me: ContactIdentity,
): Promise<LoadedStoreCustomer[]> {
    const emails = emailsOf(me);
    const tail = phoneTail(me);
    const ids = new Set<string>();

    if (tail) {
        const byPhone = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM "Customer"
            WHERE "organizationId" = ${organizationId}
              AND phone IS NOT NULL
              AND right(regexp_replace(phone, '\\D', '', 'g'), 7) = ${tail}
            ORDER BY "createdAt" ASC
            LIMIT ${CANDIDATE_CAP}`);
        for (const row of byPhone) ids.add(row.id);
    }
    if (emails.length === 0 && ids.size === 0) return [];

    const rows = await db.customer.findMany({
        where: {
            organizationId,
            identityLinks: { none: { contactId: me.id } },
            OR: [
                ...emails.map((email) => ({
                    email: { equals: email, mode: "insensitive" as const },
                })),
                ...(ids.size > 0 ? [{ id: { in: [...ids] } }] : []),
            ],
        },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
        },
        take: CANDIDATE_CAP,
    });
    return rows.map((c) => ({
        id: c.id,
        email: c.email,
        phone: c.phone,
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
    }));
}
