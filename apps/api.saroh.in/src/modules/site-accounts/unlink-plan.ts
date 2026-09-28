import type { Prisma } from "@saroh/database";

import { realOrderWhere } from "../orders/open-orders";
import { ensureThread } from "./thread-store";

/**
 * What moves when staff say "This isn't them" about a site account (A4,
 * DEC-049; round-2 plan A).
 *
 * The account was linked to a contact it did not belong to. Unlinking moves
 * the account to a new separate contact, and with it every record the
 * account itself made while it was linked (since `linkedAt`): a booking made
 * signed in, an order checked out signed in, a message the customer wrote.
 * What staff made for the contact stays with the contact.
 *
 * Each kind of record the account can make is one mover here, added by the
 * unit that first writes it with the account on it:
 * - bookings with `customerAccountId` (A9), and the invoices billing them,
 *   so the money follows the booking (review C-1);
 * - orders placed signed in, with the identity links they made (A7:
 *   `Order.customerAccountId`, written by G13's checkout and E9's
 *   treatments);
 * - thread messages the customer wrote (A13);
 * - waitlist entries (A12);
 * - mandates (D11).
 *
 * `unlink-plan.spec.ts` reads the Prisma schema and fails when a model
 * gains a `customerAccountId` without a mover here or a reason in
 * `UNLINK_STAYS`, so no unit can add one and forget it.
 */

/** Who is being moved, and from where. */
export interface UnlinkScope {
    organizationId: string;
    accountId: string;
    /** The contact staff said isn't them. */
    fromContactId: string;
    /** When the account was linked to it: only records since then move. */
    since: Date;
}

export interface UnlinkMover {
    /** A stable key, e.g. "bookings". */
    key: string;
    /** The Prisma model whose `customerAccountId` this mover reads. */
    model: string;
    /** How the confirm names one and many, e.g. ["booking", "bookings"]. */
    noun: readonly [singular: string, plural: string];
    count(tx: Prisma.TransactionClient, scope: UnlinkScope): Promise<number>;
    move(
        tx: Prisma.TransactionClient,
        scope: UnlinkScope & { toContactId: string },
    ): Promise<number>;
}

/** Records the account made on the contact it is leaving, since it linked. */
function madeByAccount(scope: UnlinkScope) {
    return {
        organizationId: scope.organizationId,
        customerAccountId: scope.accountId,
        contactId: scope.fromContactId,
        createdAt: { gte: scope.since },
    };
}

/**
 * Bookings the customer made signed in (A9). Each one moves whole — past,
 * coming up, cancelled or held — since the account made it; a booking staff
 * made for the contact has no account on it and stays.
 */
export const BOOKINGS_MOVER: UnlinkMover = {
    key: "bookings",
    model: "Booking",
    noun: ["booking", "bookings"],
    count: (tx, scope) => tx.booking.count({ where: madeByAccount(scope) }),
    move: async (tx, scope) =>
        (
            await tx.booking.updateMany({
                where: madeByAccount(scope),
                data: { contactId: scope.toContactId },
            })
        ).count,
};

/**
 * The invoices billing the bookings that move (review C-1): a paid online
 * booking's invoice, and any credit note or supplementary invoice correcting
 * it (those name the invoice, not the booking). They are billed to the
 * contact the booking was on; left behind, the contact the account leaves
 * would keep its "Spent" and the new one would show a booking with no money.
 * Only documents billed to the contact being left move: an invoice staff
 * billed to someone else stays theirs.
 *
 * Reads the bookings by their `customerAccountId`, so it runs before or
 * after BOOKINGS_MOVER alike: a moved booking sits on the new contact.
 */
export const BOOKING_INVOICES_MOVER: UnlinkMover = {
    key: "invoices",
    model: "Booking",
    noun: ["invoice", "invoices"],
    count: (tx, scope) =>
        tx.invoice.count({
            where: bookingInvoices(scope, [scope.fromContactId]),
        }),
    move: async (tx, scope) =>
        (
            await tx.invoice.updateMany({
                where: bookingInvoices(scope, [
                    scope.fromContactId,
                    scope.toContactId,
                ]),
                data: { contactId: scope.toContactId },
            })
        ).count,
};

/**
 * Invoices billed to the contact being left, for a booking the account made
 * since it linked (on either contact named), or correcting one.
 */
function bookingInvoices(scope: UnlinkScope, bookingOn: string[]) {
    const booking = {
        organizationId: scope.organizationId,
        customerAccountId: scope.accountId,
        contactId: { in: bookingOn },
        createdAt: { gte: scope.since },
    };
    return {
        organizationId: scope.organizationId,
        contactId: scope.fromContactId,
        OR: [{ booking }, { relatedInvoice: { booking } }],
    };
}

/** Messages the account wrote in the thread of the contact it is leaving. */
function writtenByAccount(scope: UnlinkScope) {
    return {
        organizationId: scope.organizationId,
        author: "CUSTOMER" as const,
        customerAccountId: scope.accountId,
        thread: { contactId: scope.fromContactId },
        createdAt: { gte: scope.since },
    };
}

/**
 * Thread messages the customer wrote from the account since it linked
 * (A13): they move into the new contact's thread, keeping their times. What
 * the team or Saroh wrote to the contact stays in the contact's thread.
 */
export const THREAD_MESSAGES_MOVER: UnlinkMover = {
    key: "messages",
    model: "CustomerThreadMessage",
    noun: ["message", "messages"],
    count: (tx, scope) =>
        tx.customerThreadMessage.count({ where: writtenByAccount(scope) }),
    move: async (tx, scope) => {
        const rows = await tx.customerThreadMessage.findMany({
            where: writtenByAccount(scope),
            select: { id: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });
        if (rows.length === 0) return 0;
        const newest = rows[rows.length - 1].createdAt;
        const thread = await ensureThread(
            tx,
            scope.organizationId,
            scope.toContactId,
            newest,
        );
        const moved = await tx.customerThreadMessage.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { threadId: thread.id },
        });
        // The customer wrote them, so they have read up to them.
        await tx.customerThread.update({
            where: { id: thread.id },
            data: { lastMessageAt: newest, customerReadAt: newest },
            select: { id: true },
        });
        return moved.count;
    },
};

/**
 * The identity links the account's own orders made (A7): a store customer
 * linked to the contact being left, since the account linked, by the
 * account's signed-in checkout (`SITE_ACCOUNT`, G13) or its treatment
 * booking (`BOOKING`, E9), whose orders include one the account placed.
 * A link staff made, a payment made or the backfill made stays.
 */
function accountMadeLinks(scope: UnlinkScope) {
    return {
        organizationId: scope.organizationId,
        contactId: scope.fromContactId,
        reason: { in: ["SITE_ACCOUNT" as const, "BOOKING" as const] },
        createdAt: { gte: scope.since },
        customer: {
            orders: {
                some: {
                    organizationId: scope.organizationId,
                    customerAccountId: scope.accountId,
                    createdAt: { gte: scope.since },
                },
            },
        },
    };
}

/** The account's real orders on those links (never an abandoned checkout). */
async function ordersOnMovingLinks(
    tx: Prisma.TransactionClient,
    scope: UnlinkScope,
): Promise<{ count: number; linkIds: string[] }> {
    const links = await tx.customerIdentityLink.findMany({
        where: accountMadeLinks(scope),
        select: { id: true, customerId: true },
    });
    if (links.length === 0) return { count: 0, linkIds: [] };
    const count = await tx.order.count({
        where: {
            organizationId: scope.organizationId,
            customerAccountId: scope.accountId,
            createdAt: { gte: scope.since },
            customerId: { in: links.map((l) => l.customerId) },
            AND: [realOrderWhere()],
        },
    });
    return { count, linkIds: links.map((l) => l.id) };
}

/**
 * Orders the customer placed signed in (A7). An order names no contact: it
 * is the contact's through its store customer's identity link, so the link
 * the account's own order made moves to the new contact, and the order with
 * it. The account keeps reading the order by its `customerAccountId`
 * wherever the link sits.
 */
export const ORDERS_MOVER: UnlinkMover = {
    key: "orders",
    model: "Order",
    noun: ["order", "orders"],
    count: async (tx, scope) => (await ordersOnMovingLinks(tx, scope)).count,
    move: async (tx, scope) => {
        const { count, linkIds } = await ordersOnMovingLinks(tx, scope);
        if (linkIds.length > 0) {
            await tx.customerIdentityLink.updateMany({
                where: { id: { in: linkIds } },
                data: { contactId: scope.toContactId },
            });
        }
        return count;
    },
};

/**
 * The records that move with the account. A9 adds the first, bookings made
 * signed in; each unit above adds its own, with a db test.
 */
export const UNLINK_MOVERS: readonly UnlinkMover[] = [
    BOOKINGS_MOVER,
    BOOKING_INVOICES_MOVER,
    ORDERS_MOVER,
    THREAD_MESSAGES_MOVER,
];

/**
 * Models that carry a `customerAccountId` and deliberately stay where they
 * are, each with why. The schema guard accepts these.
 */
export const UNLINK_STAYS: Readonly<Record<string, string>> = {
    SubscriptionEvent:
        "A log of what the account did to a subscription. It names the account, not the contact, and the subscription stays with the contact.",
};

/** One kind of record, and how many of it will move. */
export interface UnlinkMove {
    key: string;
    count: number;
    /** "2 bookings", "1 booking". */
    label: string;
}

/** Name the counts, dropping kinds with nothing to move. */
export function unlinkMoves(
    movers: readonly Pick<UnlinkMover, "key" | "noun">[],
    counts: ReadonlyMap<string, number>,
): UnlinkMove[] {
    return movers
        .map((m) => {
            const count = counts.get(m.key) ?? 0;
            return {
                key: m.key,
                count,
                label: `${count} ${count === 1 ? m.noun[0] : m.noun[1]}`,
            };
        })
        .filter((m) => m.count > 0);
}

/** "a", "a and b", "a, b and c". */
function listOf(parts: readonly string[]): string {
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The confirm's line about what moves: "2 bookings they made online move
 * with them." or, when nothing does, that everything stays.
 */
export function unlinkSentence(moves: readonly UnlinkMove[]): string {
    if (moves.length === 0) {
        return "Nothing they did online is on this record, so everything here stays.";
    }
    return `${listOf(moves.map((m) => m.label))} they made online move with them.`;
}

/** Count what each mover would move, in the caller's transaction. */
export async function countUnlinkMoves(
    tx: Prisma.TransactionClient,
    scope: UnlinkScope,
    movers: readonly UnlinkMover[] = UNLINK_MOVERS,
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const m of movers) counts.set(m.key, await m.count(tx, scope));
    return counts;
}

/** Move every mover's records to the new contact; returns what moved. */
export async function applyUnlinkMoves(
    tx: Prisma.TransactionClient,
    scope: UnlinkScope & { toContactId: string },
    movers: readonly UnlinkMover[] = UNLINK_MOVERS,
): Promise<Map<string, number>> {
    const moved = new Map<string, number>();
    for (const m of movers) moved.set(m.key, await m.move(tx, scope));
    return moved;
}
