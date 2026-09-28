import type { CustomerThreadAuthor, Prisma } from "@saroh/database";

/**
 * The customer's message thread as rows (round-2 A13, R14, default 77): one
 * `CustomerThread` per contact, made on its first message, and its
 * `CustomerThreadMessage`s. Every writer — the customer, the team, Saroh's
 * invoice post (D17), a merge (C9) and "This isn't them" (A4) — goes through
 * here, on the caller's transaction, so the thread's `lastMessageAt` and
 * read marks never drift from its messages.
 *
 * Unread is per side: a message from the other side after that side's read
 * mark. Opening the thread moves the mark (the dot clears on open).
 */

type Tx = Prisma.TransactionClient;

/** The longest message, in characters, either side can write. */
export const MESSAGE_MAX = 2_000;

export interface AppendMessage {
    organizationId: string;
    contactId: string;
    author: CustomerThreadAuthor;
    body: string;
    customerAccountId?: string | null;
    authorUserId?: string | null;
    event?: string | null;
    invoiceId?: string | null;
    now: Date;
}

export interface AppendedMessage {
    id: string;
    threadId: string;
    author: CustomerThreadAuthor;
    body: string;
    createdAt: Date;
}

/**
 * The contact's thread, made when it has none. `upsert` on the contact's
 * unique key; a first message racing another is retried once as a read.
 */
export async function ensureThread(
    tx: Tx,
    organizationId: string,
    contactId: string,
    now: Date,
): Promise<{ id: string }> {
    const key = { contactId_organizationId: { contactId, organizationId } };
    try {
        return await tx.customerThread.upsert({
            where: key,
            create: { organizationId, contactId, lastMessageAt: now },
            update: {},
            select: { id: true },
        });
    } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        return tx.customerThread.findUniqueOrThrow({
            where: key,
            select: { id: true },
        });
    }
}

/**
 * Write one message into the contact's thread. The writer's own side has
 * read everything up to it: their own message is never unread to them.
 */
export async function appendMessage(
    tx: Tx,
    input: AppendMessage,
): Promise<AppendedMessage> {
    const thread = await ensureThread(
        tx,
        input.organizationId,
        input.contactId,
        input.now,
    );
    const message = await tx.customerThreadMessage.create({
        data: {
            organizationId: input.organizationId,
            threadId: thread.id,
            author: input.author,
            body: input.body,
            customerAccountId: input.customerAccountId ?? null,
            authorUserId: input.authorUserId ?? null,
            event: input.event ?? null,
            invoiceId: input.invoiceId ?? null,
            createdAt: input.now,
        },
        select: {
            id: true,
            threadId: true,
            author: true,
            body: true,
            createdAt: true,
        },
    });
    await tx.customerThread.update({
        where: { id: thread.id },
        data: {
            lastMessageAt: input.now,
            ...(input.author === "CUSTOMER"
                ? { customerReadAt: input.now }
                : input.author === "STAFF"
                  ? { staffReadAt: input.now }
                  : {}),
        },
        select: { id: true },
    });
    return message;
}

/** Whose read mark a side reads, and which authors are "the other side". */
export type ThreadSide = "customer" | "staff";

const FROM_OTHER: Record<ThreadSide, CustomerThreadAuthor[]> = {
    // The customer hears from the team and from Saroh for the business.
    customer: ["STAFF", "SYSTEM"],
    // The team hears from the customer; its own and Saroh's posts are known.
    staff: ["CUSTOMER"],
};

/** Messages this side hasn't opened yet. */
export async function unreadCount(
    db: Pick<Tx, "customerThread" | "customerThreadMessage">,
    organizationId: string,
    contactId: string,
    side: ThreadSide,
): Promise<number> {
    const thread = await db.customerThread.findUnique({
        where: { contactId_organizationId: { contactId, organizationId } },
        select: { id: true, customerReadAt: true, staffReadAt: true },
    });
    if (!thread) return 0;
    const readAt =
        side === "customer" ? thread.customerReadAt : thread.staffReadAt;
    return db.customerThreadMessage.count({
        where: {
            threadId: thread.id,
            author: { in: FROM_OTHER[side] },
            ...(readAt ? { createdAt: { gt: readAt } } : {}),
        },
    });
}

/** Opening the thread: this side has read everything up to `now`. */
export async function markRead(
    db: Pick<Tx, "customerThread">,
    organizationId: string,
    contactId: string,
    side: ThreadSide,
    now: Date,
): Promise<void> {
    await db.customerThread.updateMany({
        where: { organizationId, contactId },
        data:
            side === "customer"
                ? { customerReadAt: now }
                : { staffReadAt: now },
    });
}

/**
 * A merge (C9, the rule in `merge-plan.ts`): the survivor's thread absorbs
 * the other's messages — each keeps its own time, so they interleave in
 * time order — and the other thread row goes. With no thread of its own,
 * the survivor simply takes the other's. Nothing is left unread that was
 * unread on either side: each read mark is the earlier of the two.
 * Returns how many messages moved.
 */
export async function absorbThread(
    tx: Tx,
    organizationId: string,
    fromContactId: string,
    toContactId: string,
): Promise<number> {
    const [from, to] = await Promise.all(
        [fromContactId, toContactId].map((contactId) =>
            tx.customerThread.findUnique({
                where: {
                    contactId_organizationId: { contactId, organizationId },
                },
                select: {
                    id: true,
                    lastMessageAt: true,
                    customerReadAt: true,
                    staffReadAt: true,
                    _count: { select: { messages: true } },
                },
            }),
        ),
    );
    if (!from) return 0;
    if (!to) {
        await tx.customerThread.update({
            where: { id: from.id },
            data: { contactId: toContactId },
            select: { id: true },
        });
        return from._count.messages;
    }
    const moved = await tx.customerThreadMessage.updateMany({
        where: { threadId: from.id },
        data: { threadId: to.id },
    });
    await tx.customerThread.update({
        where: { id: to.id },
        data: {
            lastMessageAt: later(to.lastMessageAt, from.lastMessageAt),
            customerReadAt: earlier(to.customerReadAt, from.customerReadAt),
            staffReadAt: earlier(to.staffReadAt, from.staffReadAt),
        },
        select: { id: true },
    });
    await tx.customerThread.delete({ where: { id: from.id } });
    return moved.count;
}

function later(a: Date, b: Date): Date {
    return a.getTime() >= b.getTime() ? a : b;
}

/** The earlier mark; a side that never opened one of them has read nothing. */
function earlier(a: Date | null, b: Date | null): Date | null {
    if (!a || !b) return null;
    return a.getTime() <= b.getTime() ? a : b;
}
