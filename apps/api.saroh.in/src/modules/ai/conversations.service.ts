import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiMessageRole, AiTurnOutcome } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AiMessageContent } from "./history/sealing";
import { openAiText, openMessageBody, sealedParts } from "./history/sealing";

/**
 * A person's own Ask AI conversations (DEC-220): read by (id, the business
 * from the request's context, the person asking), so another member's
 * conversation, or another business's, is simply not there (404). Text is
 * opened only here, on the way out. History stays readable with Ask AI
 * off (`ask-ai.controller.ts`).
 */

/** A bound on one list, not a plan limit. */
export const CONVERSATIONS_LISTED = 50;

export interface AiConversationSummary {
    id: string;
    agent: string;
    title: string | null;
    lastMessageAt: string;
    createdAt: string;
}

export interface AiMessageView extends AiMessageContent {
    id: string;
    role: AiMessageRole;
    outcome: AiTurnOutcome | null;
    createdAt: string;
}

export interface AiConversationView extends AiConversationSummary {
    messages: AiMessageView[];
}

const notFound = () => new NotFoundException("That conversation isn't here");

const SUMMARY = {
    id: true,
    organizationId: true,
    agent: true,
    titleCiphertext: true,
    titleIv: true,
    titleAuthTag: true,
    lastMessageAt: true,
    createdAt: true,
} as const;

function summary(row: {
    id: string;
    organizationId: string;
    agent: string;
    titleCiphertext: string | null;
    titleIv: string | null;
    titleAuthTag: string | null;
    lastMessageAt: Date;
    createdAt: Date;
}): AiConversationSummary {
    const sealed = sealedParts(
        row.titleCiphertext,
        row.titleIv,
        row.titleAuthTag,
    );
    return {
        id: row.id,
        agent: row.agent,
        title: sealed
            ? openAiText(sealed, {
                  organizationId: row.organizationId,
                  conversationId: row.id,
                  rowId: row.id,
                  field: "title",
              })
            : null,
        lastMessageAt: row.lastMessageAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
    };
}

@Injectable()
export class ConversationsService {
    /**
     * The asker's conversations in this business, newest first, a page of
     * {@link CONVERSATIONS_LISTED}; `cursor` is the last id of the page
     * before (one not theirs reads as the first page's end: nothing).
     */
    async list(
        ctx: OrganizationContext,
        cursor?: string,
    ): Promise<AiConversationSummary[]> {
        const mine = { organizationId: ctx.organizationId, userId: ctx.userId };
        if (
            cursor &&
            !(await prisma.aiConversation.findFirst({
                where: { ...mine, id: cursor },
                select: { id: true },
            }))
        ) {
            return [];
        }
        const rows = await prisma.aiConversation.findMany({
            where: mine,
            orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
            take: CONVERSATIONS_LISTED,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: SUMMARY,
        });
        return rows.map(summary);
    }

    /** Throws 404 unless the conversation is the asker's own in this business. */
    async assertOwn(
        ctx: OrganizationContext,
        conversationId: string,
    ): Promise<void> {
        const row = await prisma.aiConversation.findFirst({
            where: {
                id: conversationId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
            select: { id: true },
        });
        if (!row) throw notFound();
    }

    /** One of the asker's conversations with its messages, oldest first. */
    async get(
        ctx: OrganizationContext,
        conversationId: string,
    ): Promise<AiConversationView> {
        const row = await prisma.aiConversation.findFirst({
            where: {
                id: conversationId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
            select: {
                ...SUMMARY,
                messages: {
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: {
                        id: true,
                        role: true,
                        outcome: true,
                        bodyCiphertext: true,
                        bodyIv: true,
                        bodyAuthTag: true,
                        createdAt: true,
                    },
                },
            },
        });
        if (!row) throw notFound();
        return {
            ...summary(row),
            messages: row.messages.map((m) => ({
                ...openMessageBody(
                    {
                        ciphertext: m.bodyCiphertext,
                        iv: m.bodyIv,
                        authTag: m.bodyAuthTag,
                    },
                    {
                        organizationId: row.organizationId,
                        conversationId: row.id,
                        rowId: m.id,
                    },
                ),
                id: m.id,
                role: m.role,
                outcome: m.outcome,
                createdAt: m.createdAt.toISOString(),
            })),
        };
    }
}
