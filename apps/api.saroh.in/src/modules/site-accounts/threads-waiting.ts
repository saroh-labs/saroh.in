import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { contactEmailForDisplay } from "../contacts/contact-email";
import { personName } from "./customer-view";

/**
 * Customers waiting on the team (round-2 F2): the read behind Home's
 * "‹Name› is waiting for a reply". `ThreadsService.waitingOnTeam` checks
 * the viewer and the account area, then asks this.
 *
 * A customer waits from their first message after the team last wrote.
 * Saroh's own posts (an invoice sent) answer nobody, so only a STAFF
 * message ends the wait. A merged-away person's thread has moved to the
 * survivor (C9), so their record is never listed.
 */

type Db = Pick<
    typeof prisma,
    "$queryRaw" | "contact" | "customerThreadMessage"
>;

/** A customer whose messages wait on the team. */
export interface WaitingThread {
    contactId: string;
    /** Their name, or their email; null when the record has neither. */
    name: string | null;
    /** Their first message since the team last wrote. */
    since: Date;
    /** Their newest message's words. */
    lastBody: string;
    /** How many they've sent since the team last wrote. */
    messages: number;
}

export interface WaitingThreads {
    /** Every customer waiting, past the rows sent. */
    count: number;
    /** Of those, waiting a day or more. */
    longWaits: number;
    /** The longest waits first, at most the limit asked for. */
    threads: WaitingThread[];
}

export const NOBODY_WAITING: WaitingThreads = {
    count: 0,
    longWaits: 0,
    threads: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Those whose wait began more than `olderThanMs` ago, the longest wait
 * first, at most `limit` of them; `count` is all of them.
 */
export async function readWaitingOnTeam(
    db: Db,
    organizationId: string,
    view: { now: Date; olderThanMs: number; limit: number },
): Promise<WaitingThreads> {
    const cutoff = new Date(view.now.getTime() - view.olderThanMs);
    const dayAgo = new Date(view.now.getTime() - DAY_MS);
    const picked = await db.$queryRaw<
        {
            threadId: string;
            contactId: string;
            since: Date;
            messages: number;
            total: number;
            long: number;
        }[]
    >(Prisma.sql`WITH waiting AS (
        SELECT t.id AS "threadId", t."contactId",
            MIN(m."createdAt") AS since,
            COUNT(*)::int AS messages
        FROM "CustomerThread" t
        JOIN "Contact" c
            ON c.id = t."contactId"
            AND c."organizationId" = t."organizationId"
            AND c."mergedIntoId" IS NULL
        JOIN "CustomerThreadMessage" m
            ON m."threadId" = t.id AND m.author = 'CUSTOMER'
        WHERE t."organizationId" = ${organizationId}
            AND m."createdAt" > COALESCE(
                (SELECT MAX(s."createdAt") FROM "CustomerThreadMessage" s
                 WHERE s."threadId" = t.id AND s.author = 'STAFF'),
                '-infinity'::timestamp)
        GROUP BY t.id, t."contactId"
    )
    SELECT "threadId", "contactId", since, messages,
        (COUNT(*) OVER ())::int AS total,
        (COUNT(*) FILTER (WHERE since <= ${dayAgo}) OVER ())::int AS long
    FROM waiting
    WHERE since <= ${cutoff}
    ORDER BY since ASC, "threadId" ASC
    LIMIT ${view.limit}`);
    if (picked.length === 0) return NOBODY_WAITING;

    const [contacts, latest] = await Promise.all([
        db.contact.findMany({
            where: {
                organizationId,
                id: { in: picked.map((p) => p.contactId) },
            },
            select: { id: true, firstName: true, lastName: true, email: true },
        }),
        db.customerThreadMessage.findMany({
            where: {
                organizationId,
                threadId: { in: picked.map((p) => p.threadId) },
                author: "CUSTOMER",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            distinct: ["threadId"],
            select: { threadId: true, body: true },
        }),
    ]);
    const byContact = new Map(contacts.map((c) => [c.id, c]));
    const lastBody = new Map(latest.map((m) => [m.threadId, m.body]));
    return {
        count: picked[0].total,
        longWaits: picked[0].long,
        threads: picked.map((p) => {
            const contact = byContact.get(p.contactId);
            return {
                contactId: p.contactId,
                // Never a placeholder address (a site account's own record).
                name: contact
                    ? (personName(contact) ??
                      contactEmailForDisplay(contact.email))
                    : null,
                since: p.since,
                lastBody: lastBody.get(p.threadId) ?? "",
                messages: p.messages,
            };
        }),
    };
}
