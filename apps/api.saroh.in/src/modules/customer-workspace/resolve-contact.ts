import type { Prisma } from "@saroh/database";

/**
 * Turn a contact id that came from outside the request's own reads into the
 * contact to write against (DEC-042, C9).
 *
 * A merge keeps the merged-away contact as a tombstone pointing at the
 * survivor (`Contact.mergedIntoId`), so work that captured its id before the
 * merge — a payment webhook, a queued job, a signed-in session, a pay link,
 * a first sign-in's `linkOrCreate` — still finds a row, and lands on the
 * survivor instead of on a record nobody can see.
 *
 * THE RULE FOR WRITERS: any write that takes a contact id from a webhook, a
 * job payload, a session's account, a token or a page loaded earlier calls
 * this in its transaction and writes against the returned `id`.
 *
 * It takes `FOR SHARE` on the contact row (and on the survivor's, after one
 * hop). That conflicts with the merge's `FOR UPDATE`, so the write either
 * commits before the merge — and the merge moves its row — or after it, and
 * lands on the survivor. A merge re-points older tombstones to the new
 * survivor, so the chain is one hop; a few more are followed defensively.
 *
 * Outside a transaction the lock ends with the statement: the answer is
 * still the right contact, it just isn't held.
 *
 * A contact removed for privacy (C11) resolves to itself with `removed`
 * set, and the writer refuses as it would for a missing contact.
 *
 * Returns null when there is no such contact (in `organizationId`, when
 * given).
 */

export interface ResolvedContact {
    /** The contact to write against: the survivor, for a tombstone. */
    id: string;
    organizationId: string;
    /** The tombstone the id named, when it was one; otherwise null. */
    mergedFrom: string | null;
    /** Removed for privacy (C11): refuse the write. */
    removed: boolean;
}

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

interface Row {
    id: string;
    organizationId: string;
    mergedIntoId: string | null;
    email: string;
}

/** A merge keeps the chain at one hop; this is only a backstop. */
const MAX_HOPS = 3;

/**
 * Removed for privacy. C11 adds `Contact.removedAt` and switches this to
 * read it; until then a removal is the `removed+<id>@removed.invalid`
 * placeholder (`contacts/contact-email.ts`), which no contact carries yet.
 */
export function isRemovedContact(row: { email: string }): boolean {
    const email = row.email.trim().toLowerCase();
    return email.startsWith("removed+") && email.endsWith("@removed.invalid");
}

async function lockRow(
    db: Db,
    contactId: string,
    organizationId: string | undefined,
): Promise<Row | null> {
    const rows = organizationId
        ? await db.$queryRaw<Row[]>`
            SELECT id, "organizationId", "mergedIntoId", email FROM "Contact"
            WHERE id = ${contactId} AND "organizationId" = ${organizationId}
            FOR SHARE`
        : await db.$queryRaw<Row[]>`
            SELECT id, "organizationId", "mergedIntoId", email FROM "Contact"
            WHERE id = ${contactId}
            FOR SHARE`;
    return rows[0] ?? null;
}

/** The contact to write against for `contactId`; see the note at the top. */
export async function resolveContact(
    db: Db,
    contactId: string,
    organizationId?: string,
): Promise<ResolvedContact | null> {
    let row = await lockRow(db, contactId, organizationId);
    if (!row) return null;
    let mergedFrom: string | null = null;
    for (let hop = 0; hop < MAX_HOPS && row.mergedIntoId; hop += 1) {
        mergedFrom ??= row.id;
        const next = await lockRow(db, row.mergedIntoId, row.organizationId);
        if (!next) break;
        row = next;
    }
    return {
        id: row.id,
        organizationId: row.organizationId,
        mergedFrom,
        removed: isRemovedContact(row),
    };
}
