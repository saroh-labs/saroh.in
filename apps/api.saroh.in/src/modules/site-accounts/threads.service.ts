import {
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { CustomerThreadAuthor } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    isRemovedContact,
    resolveContact,
} from "../customer-workspace/resolve-contact";
import { allows, authorize } from "../organizations/organization-policy";
import { accountAreaOn } from "./account-area";
import type { CustomerContext } from "./customer-context.decorator";
import type { AccountMessage, AccountThread } from "./customer-view";
import { messageView } from "./customer-view";
import { appendMessage, markRead, unreadCount } from "./thread-store";
import type { WaitingThreads } from "./threads-waiting";
import { NOBODY_WAITING, readWaitingOnTeam } from "./threads-waiting";

export type { WaitingThread, WaitingThreads } from "./threads-waiting";

/**
 * The customer's message thread with the business (round-2 A13, R14; ADR-011
 * "Message the business in one thread, answered by the team").
 *
 * The customer reads and writes it from their account on the business's
 * site (`account-messages.controller.ts`), always their own contact's, in
 * that business's RLS context; everything they see leaves through
 * `customer-view.ts` (`messageView`). The team reads it with `message:read`
 * and answers with `message:write` from Customer Detail
 * (`customer-workspace/threads.controller.ts`).
 *
 * Bodies are plain text with a length cap (the DTOs), stored as written and
 * never rendered as HTML. A customer's posts are limited per account by
 * counting their own rows, so the limit survives a restart.
 */

/** The newest messages a read returns; older ones stay in the thread. */
export const THREAD_ROWS = 100;
/** A customer can send this many messages a minute, and this many an hour. */
export const POSTS_PER_MINUTE = 5;
export const POSTS_PER_HOUR = 30;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type Ctx = Pick<CustomerContext, "organizationId" | "contactId" | "accountId">;

/** One message as the team sees it on Customer Detail. */
export interface StaffThreadMessage {
    id: string;
    author: CustomerThreadAuthor;
    body: string;
    at: string;
    /** The staff member who wrote it, by name; null for the customer or Saroh. */
    by: string | null;
    /** Their own: the viewer wrote it. */
    mine: boolean;
    /** What a Saroh post says happened (INVOICE_SENT, …), and its invoice. */
    event: string | null;
    invoiceId: string | null;
}

export interface StaffThread {
    /** Oldest first: the newest {@link THREAD_ROWS}. */
    messages: StaffThreadMessage[];
    earlier: boolean;
    /** From the customer, since the team last opened it. */
    unread: number;
    /**
     * They have a live site account, so they will see a reply. Without one,
     * a reply waits: "They'll see it when they sign in on your site".
     */
    signsIn: boolean;
    /** The viewer may answer (`message:write`). */
    canReply: boolean;
}

function notFound(): never {
    throw new NotFoundException("Customer not found");
}

@Injectable()
export class ThreadsService {
    // ---- The customer's side --------------------------------------------

    /**
     * The customer's thread, and opening it: the business's messages are
     * read from now on, so the tab's dot clears. Empty before anyone wrote.
     */
    async forCustomer(
        ctx: Ctx,
        now: Date = new Date(),
    ): Promise<AccountThread> {
        const rows = await this.newest(ctx.organizationId, ctx.contactId);
        if (rows.messages.length > 0) {
            await markRead(
                prisma,
                ctx.organizationId,
                ctx.contactId,
                "customer",
                now,
            );
        }
        return {
            messages: rows.messages.map(messageView),
            earlier: rows.earlier,
        };
    }

    /** Messages from the business they haven't opened: Me's tab dot. */
    unreadForCustomer(ctx: Ctx): Promise<number> {
        return unreadCount(
            prisma,
            ctx.organizationId,
            ctx.contactId,
            "customer",
        );
    }

    /** The customer writes to the business. */
    async postFromCustomer(
        ctx: Ctx,
        text: string,
        now: Date = new Date(),
    ): Promise<AccountMessage> {
        return prisma.$transaction(async (tx) => {
            // Their session named the contact: a merge since then lands the
            // message on the survivor (C9's rule for writers).
            const contact = await resolveContact(
                tx,
                ctx.contactId,
                ctx.organizationId,
            );
            if (!contact || contact.removed) notFound();

            const [lastMinute, lastHour] = await Promise.all(
                [MINUTE_MS, HOUR_MS].map((span) =>
                    tx.customerThreadMessage.count({
                        where: {
                            organizationId: ctx.organizationId,
                            customerAccountId: ctx.accountId,
                            createdAt: { gt: new Date(now.getTime() - span) },
                        },
                    }),
                ),
            );
            if (lastMinute >= POSTS_PER_MINUTE || lastHour >= POSTS_PER_HOUR) {
                throw new HttpException(
                    {
                        message:
                            lastHour >= POSTS_PER_HOUR
                                ? "You've sent a lot of messages this hour. The team will read them — try again later."
                                : "You're sending messages quickly. Wait a minute, then try again.",
                        details: { reason: "too-many" },
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            const message = await appendMessage(tx, {
                organizationId: ctx.organizationId,
                contactId: contact.id,
                author: "CUSTOMER",
                body: text,
                customerAccountId: ctx.accountId,
                now,
            });
            return messageView(message);
        });
    }

    // ---- The team's side ------------------------------------------------

    /** The thread on Customer Detail (`message:read`). */
    async forStaff(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<StaffThread> {
        authorize(ctx, "message:read");
        const organizationId = ctx.organizationId;
        await this.liveContact(organizationId, contactId);
        const [rows, unread, accounts] = await Promise.all([
            this.newest(organizationId, contactId),
            unreadCount(prisma, organizationId, contactId, "staff"),
            prisma.customerAccount.count({
                where: { organizationId, contactId, status: "ACTIVE" },
            }),
        ]);
        const userIds = [
            ...new Set(
                rows.messages
                    .map((m) => m.authorUserId)
                    .filter((id): id is string => id !== null),
            ),
        ];
        const users = userIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: { id: true, name: true },
              })
            : [];
        const names = new Map(
            users.map((u) => [u.id, u.name?.trim() ? u.name.trim() : null]),
        );
        return {
            messages: rows.messages.map((m) => ({
                id: m.id,
                author: m.author,
                body: m.body,
                at: m.createdAt.toISOString(),
                by:
                    m.author === "STAFF" && m.authorUserId
                        ? (names.get(m.authorUserId) ?? null)
                        : null,
                mine: m.author === "STAFF" && m.authorUserId === ctx.userId,
                event: m.event,
                invoiceId: m.invoiceId,
            })),
            earlier: rows.earlier,
            unread,
            signsIn: accounts > 0,
            canReply: allows(ctx, "message:write"),
        };
    }

    /** The team opened it: the customer's messages are read (`message:read`). */
    async markReadByStaff(
        ctx: OrganizationContext,
        contactId: string,
        now: Date = new Date(),
    ): Promise<{ unread: 0 }> {
        authorize(ctx, "message:read");
        await this.liveContact(ctx.organizationId, contactId);
        await markRead(prisma, ctx.organizationId, contactId, "staff", now);
        return { unread: 0 };
    }

    /** The team answers (`message:write`). */
    async reply(
        ctx: OrganizationContext,
        contactId: string,
        text: string,
        now: Date = new Date(),
    ): Promise<StaffThreadMessage> {
        authorize(ctx, "message:write");
        const organizationId = ctx.organizationId;
        return prisma.$transaction(async (tx) => {
            const contact = await resolveContact(tx, contactId, organizationId);
            if (!contact || contact.removed || contact.mergedFrom) notFound();
            const message = await appendMessage(tx, {
                organizationId,
                contactId: contact.id,
                author: "STAFF",
                body: text,
                authorUserId: ctx.userId,
                now,
            });
            const me = await tx.user.findUnique({
                where: { id: ctx.userId },
                select: { name: true },
            });
            return {
                id: message.id,
                author: message.author,
                body: message.body,
                at: message.createdAt.toISOString(),
                by: me?.name?.trim() ? me.name.trim() : null,
                mine: true,
                event: null,
                invoiceId: null,
            };
        });
    }

    /**
     * Customers waiting on the team (Home's Needs you, round-2 F2): a
     * thread whose customer wrote after the team last did, and whose first
     * such message is older than `olderThanMs`. Saroh's own posts (an
     * invoice sent) answer nobody, so only a STAFF message ends the wait.
     * The longest wait first.
     *
     * `message:read`, as the thread itself. Nothing while the account area
     * is off: no customer can write, and the team is never shown a thread
     * it can't open.
     */
    async waitingOnTeam(
        ctx: OrganizationContext,
        view: { now: Date; olderThanMs: number; limit: number },
    ): Promise<WaitingThreads> {
        authorize(ctx, "message:read");
        if (!accountAreaOn()) return NOBODY_WAITING;
        return readWaitingOnTeam(prisma, ctx.organizationId, view);
    }

    // ---- Reads ----------------------------------------------------------

    /** The newest messages, returned oldest first. */
    private async newest(organizationId: string, contactId: string) {
        const thread = await prisma.customerThread.findUnique({
            where: { contactId_organizationId: { contactId, organizationId } },
            select: { id: true },
        });
        if (!thread) return { messages: [], earlier: false };
        const rows = await prisma.customerThreadMessage.findMany({
            where: { threadId: thread.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: THREAD_ROWS + 1,
            select: {
                id: true,
                author: true,
                body: true,
                createdAt: true,
                authorUserId: true,
                event: true,
                invoiceId: true,
            },
        });
        return {
            messages: rows.slice(0, THREAD_ROWS).reverse(),
            earlier: rows.length > THREAD_ROWS,
        };
    }

    /** A contact of this business that is neither merged away nor removed. */
    private async liveContact(
        organizationId: string,
        contactId: string,
    ): Promise<void> {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, organizationId, mergedIntoId: null },
            select: { id: true, email: true },
        });
        if (!contact || isRemovedContact(contact)) notFound();
    }
}
