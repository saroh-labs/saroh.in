import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { isReservedContactEmail } from "../contacts/contact-email";
import type { ContactIdentity } from "./duplicates";
import { duplicatesOf, normaliseEmail, normalisePhone } from "./duplicates";
import { loadContactIdentities } from "./suggestion-candidates";

/**
 * "Possible duplicate" on a page of the Customers list (C3): which of the
 * page's contacts pair with another contact, by C2's rules in
 * `duplicates.ts`. The candidates for the whole page are read in two
 * queries (by email, and by the phone's last seven digits), then
 * `duplicatesOf` decides — the same rules as the suggestions on Customer
 * Detail, so the list flags exactly the people whose page offers a merge.
 */

type Db = typeof prisma;

/** Account states that sign in: a MERGED account sits on a tombstone. */
const LIVE_ACCOUNT = ["ACTIVE", "BLOCKED"] as const;

/** Enough candidates for a page of 50 people; the queries only narrow. */
const CANDIDATE_CAP = 500;

function emailsOf(contact: ContactIdentity): string[] {
    return [contact.email, contact.account?.email]
        .map((e) => normaliseEmail(e))
        .filter((e): e is string => e != null);
}

/** A phone pair needs no account on this side (`duplicates.ts`). */
function phoneTail(contact: ContactIdentity): string | null {
    if (contact.account) return null;
    const phone = normalisePhone(contact.phone);
    return phone ? phone.slice(-7) : null;
}

/** The ids among `contactIds` that pair with at least one other contact. */
export async function possibleDuplicates(
    db: Db,
    organizationId: string,
    contactIds: readonly string[],
): Promise<Set<string>> {
    const out = new Set<string>();
    if (contactIds.length === 0) return out;
    const page = await loadContactIdentities(db, organizationId, contactIds);

    const emails = [...new Set(page.flatMap(emailsOf))];
    const tails = [
        ...new Set(page.map(phoneTail).filter((t): t is string => t != null)),
    ];
    const ids = new Set<string>();
    if (emails.length > 0) {
        const byEmail = await db.contact.findMany({
            where: {
                organizationId,
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
    if (tails.length > 0) {
        const byPhone = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM "Contact"
            WHERE "organizationId" = ${organizationId}
              AND phone IS NOT NULL
              AND right(regexp_replace(phone, '\\D', '', 'g'), 7) = ANY(${tails}::text[])
            LIMIT ${CANDIDATE_CAP}`);
        for (const row of byPhone) ids.add(row.id);
    }
    const known = new Map(page.map((c) => [c.id, c]));
    const missing = [...ids].filter((id) => !known.has(id));
    const candidates = [
        ...page,
        ...(await loadContactIdentities(db, organizationId, missing)),
    ].filter(
        // A tombstone or a removed contact is nobody to merge with.
        (c) => !(isReservedContactEmail(c.email) && c.account == null),
    );

    for (const me of page) {
        if (duplicatesOf(me, candidates).length > 0) out.add(me.id);
    }
    return out;
}
