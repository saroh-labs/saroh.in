import type { Prisma } from "@saroh/database";

import { businessName, defineNotice, firstWord } from "./notice";

/**
 * "‹Business› replied to your message" (DEC-174 U14, #1145): a team reply
 * in the customer's Messages thread, emailed to them through the
 * business's own provider, so they learn of it without signing in.
 * Queued by the team's reply (`site-accounts/team-reply.ts`) while the
 * TEAM_REPLY switch is on and a provider is connected, held
 * {@link TEAM_REPLY_HOLD_MS}. Email only: the reply is already in the
 * thread, so nothing is posted there.
 *
 * Coalesced (A5): each reply queues its own held job, and only the run for
 * the newest reply in the thread sends. That one email carries every reply
 * not yet emailed, oldest first, so three replies a few seconds apart are
 * one email a minute after the last. "Not yet emailed" stops at the last
 * reply whose run sent an email (its `CustomerNotice` has a message),
 * since that email carried everything before it too.
 *
 * A message the customer wrote in between doesn't stop it: the reply is
 * still theirs to read. The words are the team's own, so they go in the
 * business's email, never Saroh's.
 */

/** How long a reply waits for the next one before it is emailed (A5). */
export const TEAM_REPLY_HOLD_MS = 60_000;

/** The most replies one email carries; older ones are in Messages. */
export const TEAM_REPLY_MAX = 20;

/** Replies older than this before the newest aren't emailed again. */
export const TEAM_REPLY_LOOKBACK_MS = 24 * 3600_000;

export interface TeamReplyVars {
    business: string;
    firstName: string | null;
    /** The team's replies, oldest first, as they wrote them. */
    replies: string[];
    /** The way back to their Messages on the business's site. */
    link: string | null;
}

export interface TeamReplyNotice {
    kind: "THREAD_REPLY";
    reply: TeamReplyVars;
}

/** The once-per-reply key of its notice. */
export function teamReplyNoticeKey(threadMessageId: string): string {
    return `thread-reply:${threadMessageId}`;
}

type Tx = Prisma.TransactionClient;

/**
 * The replies one run emails, oldest first: empty when a newer reply in the
 * thread will send instead (or this one is gone).
 */
export async function repliesToEmail(
    tx: Tx,
    organizationId: string,
    threadMessageId: string,
): Promise<{ contactId: string; replies: string[] } | null> {
    const reply = await tx.customerThreadMessage.findFirst({
        where: { id: threadMessageId, organizationId, author: "STAFF" },
        select: {
            threadId: true,
            createdAt: true,
            thread: { select: { contactId: true } },
        },
    });
    if (!reply) return null;
    const recent = await tx.customerThreadMessage.findMany({
        where: {
            organizationId,
            threadId: reply.threadId,
            author: "STAFF",
            createdAt: {
                gte: new Date(
                    reply.createdAt.getTime() - TEAM_REPLY_LOOKBACK_MS,
                ),
            },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: TEAM_REPLY_MAX,
        select: { id: true, body: true },
    });
    // A newer reply's own run carries this one.
    if (recent[0]?.id !== threadMessageId) return null;
    const sent = await tx.customerNotice.findMany({
        where: {
            organizationId,
            eventKey: { in: recent.map((m) => teamReplyNoticeKey(m.id)) },
            messageId: { not: null },
        },
        select: { eventKey: true },
    });
    const emailed = new Set(sent.map((n) => n.eventKey));
    const replies: string[] = [];
    for (const m of recent) {
        if (emailed.has(teamReplyNoticeKey(m.id))) break;
        replies.push(m.body);
    }
    return { contactId: reply.thread.contactId, replies: replies.reverse() };
}

export const teamReplyNotice = defineNotice<TeamReplyNotice>({
    setting: "TEAM_REPLY",
    emailOnly: true,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "THREAD_REPLY" || !payload.threadMessageId) {
            return null;
        }
        const found = await repliesToEmail(
            tx,
            organizationId,
            payload.threadMessageId,
        );
        if (!found || found.replies.length === 0) return null;
        const contact = await tx.contact.findFirst({
            where: { id: found.contactId, organizationId },
            select: { firstName: true },
        });
        return {
            contactId: found.contactId,
            vars: {
                kind: "THREAD_REPLY",
                reply: {
                    business: await businessName(tx, organizationId),
                    firstName: firstWord(contact?.firstName),
                    replies: found.replies,
                    link: null,
                },
            },
        };
    },
    sentence: ({ reply }) => `${reply.business} replied to your message.`,
    subject: ({ reply }) => `${reply.business} replied to your message`,
    names: ({ reply }) => ({
        business: reply.business,
        firstName: reply.firstName,
    }),
    quote: ({ reply }) =>
        reply.replies.length > 0
            ? {
                  lead:
                      reply.replies.length > 1
                          ? "Their replies:"
                          : "Their reply:",
                  text: reply.replies.join("\n\n"),
              }
            : null,
    backLink: ({ reply }) =>
        reply.link
            ? { lead: "Read it and reply in your Messages:", url: reply.link }
            : null,
    withLink: (vars, link) => ({ ...vars, reply: { ...vars.reply, link } }),
});
