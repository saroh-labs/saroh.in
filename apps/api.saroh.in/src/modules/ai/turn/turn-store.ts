import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiLanguage, AiTurnOutcome } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { meterWindow } from "../../billing/metering";
import type { AskAiRefusal, TurnAdmit } from "../access/refusal";
import { ConversationsService } from "../conversations.service";
import { sealMessageBody } from "../history/sealing";
import type { AiMessage } from "../providers/provider.port";
import type { TurnTokens } from "./guards";

/**
 * A turn's rows (DEC-220): the usage row written RUNNING when the turn
 * starts and finished when it ends, and the question and answer sealed.
 * Each write runs as the business but outside the request's transaction,
 * so the RUNNING row is there even if the turn dies, and a turn that
 * outlives its request (the client went away) still saves.
 */

export interface TurnConversation {
    id: string;
    organizationId: string;
    agent: string;
    agentVersion: string;
    model: string;
    effort: string;
}

export interface TurnFinish {
    text: string;
    card?: { kind: string; data: Record<string, unknown> };
    outcome: AiTurnOutcome;
    counted: boolean;
    stopped: boolean;
    failureReason?: string;
    tokens: TurnTokens;
    costMicroUsd: number;
    over100k: boolean;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

const CONVERSATION = {
    id: true,
    organizationId: true,
    agent: true,
    agentVersion: true,
    model: true,
    effort: true,
} as const;

@Injectable()
export class TurnStore {
    constructor(private readonly conversations: ConversationsService) {}

    createConversation(
        ctx: OrganizationContext,
        data: Omit<TurnConversation, "id" | "organizationId">,
    ): Promise<TurnConversation> {
        return asBusiness(ctx.organizationId, () =>
            prisma.aiConversation.create({
                data: {
                    ...data,
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                },
                select: CONVERSATION,
            }),
        );
    }

    /**
     * The asker's own conversation and its earlier questions with their
     * answers, as the model reads them. A question that got no answer text
     * is left out, so the roles keep alternating.
     */
    load(
        ctx: OrganizationContext,
        conversationId: string,
    ): Promise<{ conversation: TurnConversation; history: AiMessage[] }> {
        return asBusiness(ctx.organizationId, async () => {
            const conversation = await prisma.aiConversation.findFirst({
                where: {
                    id: conversationId,
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                },
                select: CONVERSATION,
            });
            if (!conversation) {
                throw new NotFoundException("That conversation isn't here");
            }
            const { messages } = await this.conversations.get(
                ctx,
                conversationId,
            );
            const history: AiMessage[] = [];
            let question: string | null = null;
            for (const m of messages) {
                if (m.role === "USER") question = m.text;
                else if (m.role === "ASSISTANT" && question && m.text) {
                    history.push(
                        { role: "user", text: question },
                        { role: "assistant", text: m.text },
                    );
                    question = null;
                }
            }
            return { conversation, history };
        });
    }

    /** Whether the business has Ask AI on (no row: on, the default). */
    async businessOn(organizationId: string): Promise<boolean> {
        const row = await asBusiness(organizationId, () =>
            prisma.aiBusinessSetting.findUnique({
                where: { organizationId },
                select: { askAiOn: true },
            }),
        );
        return row?.askAiOn ?? true;
    }

    /** Turns Ask AI on or off for the business (the Owner's or an Admin's switch). */
    async setBusinessOn(ctx: OrganizationContext, on: boolean): Promise<void> {
        const data = { askAiOn: on, updatedByUserId: ctx.userId };
        await asBusiness(ctx.organizationId, () =>
            prisma.aiBusinessSetting.upsert({
                where: { organizationId: ctx.organizationId },
                create: { organizationId: ctx.organizationId, ...data },
                update: data,
            }),
        );
    }

    async setLanguage(
        ctx: OrganizationContext,
        language: AiLanguage,
    ): Promise<void> {
        await asBusiness(ctx.organizationId, () =>
            prisma.aiPersonSetting.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: ctx.organizationId,
                        userId: ctx.userId,
                    },
                },
                create: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    language,
                },
                update: { language },
            }),
        );
    }

    async language(ctx: OrganizationContext): Promise<AiLanguage> {
        const row = await asBusiness(ctx.organizationId, () =>
            prisma.aiPersonSetting.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId: ctx.organizationId,
                        userId: ctx.userId,
                    },
                },
                select: { language: true },
            }),
        );
        return row?.language ?? "MATCH";
    }

    /**
     * The usage row, RUNNING, and the question, sealed, once `admit` (the
     * start's checks, `AskAiAccess.admit`) finds room on the same
     * transaction; the RUNNING row is what later starts see. Refused,
     * nothing is written but a business or Saroh day at its limit, which
     * leaves a DAILY_LIMIT row (not counted, no text) for the alarms (U8).
     */
    start(
        ctx: OrganizationContext,
        conversation: TurnConversation,
        turnId: string,
        question: string,
        now: Date,
        admit?: TurnAdmit,
    ): Promise<AskAiRefusal | null> {
        return asBusiness(ctx.organizationId, () =>
            prisma.$transaction(async (tx) => {
                const window = await meterWindow(tx, ctx.organizationId, now);
                const refusal = admit ? await admit(tx, window) : null;
                const usage = {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    conversationId: conversation.id,
                    turnId,
                    agent: conversation.agent,
                    agentVersion: conversation.agentVersion,
                    model: conversation.model,
                    effort: conversation.effort,
                    windowStart: window.start,
                    windowKey: window.key,
                    startedAt: now,
                };
                if (refusal) {
                    if (refusal.reason === "daily-limit") {
                        await tx.aiUsage.create({
                            data: {
                                ...usage,
                                outcome: "DAILY_LIMIT",
                                finishedAt: now,
                            },
                        });
                    }
                    return refusal;
                }
                const messageId = randomUUID();
                const body = sealMessageBody(
                    { text: question },
                    {
                        organizationId: ctx.organizationId,
                        conversationId: conversation.id,
                        rowId: messageId,
                    },
                );
                await tx.aiUsage.create({ data: usage });
                await tx.aiMessage.create({
                    data: {
                        id: messageId,
                        organizationId: ctx.organizationId,
                        conversationId: conversation.id,
                        role: "USER",
                        bodyCiphertext: body.ciphertext,
                        bodyIv: body.iv,
                        bodyAuthTag: body.authTag,
                        createdAt: now,
                    },
                });
                await tx.aiConversation.update({
                    where: { id: conversation.id },
                    data: { lastMessageAt: now },
                });
                return null;
            }),
        );
    }

    /** The answer sealed (even an empty one, to carry the outcome) and the usage row finished. */
    finish(
        ctx: OrganizationContext,
        conversation: TurnConversation,
        turnId: string,
        f: TurnFinish,
    ): Promise<void> {
        return asBusiness(ctx.organizationId, async () => {
            const now = new Date();
            const messageId = randomUUID();
            const body = sealMessageBody(
                { text: f.text, ...(f.card ? { card: f.card } : {}) },
                {
                    organizationId: ctx.organizationId,
                    conversationId: conversation.id,
                    rowId: messageId,
                },
            );
            await prisma.$transaction([
                prisma.aiMessage.create({
                    data: {
                        id: messageId,
                        organizationId: ctx.organizationId,
                        conversationId: conversation.id,
                        role: "ASSISTANT",
                        bodyCiphertext: body.ciphertext,
                        bodyIv: body.iv,
                        bodyAuthTag: body.authTag,
                        outcome: f.outcome,
                        createdAt: now,
                    },
                }),
                prisma.aiConversation.update({
                    where: { id: conversation.id },
                    data: { lastMessageAt: now },
                }),
                prisma.aiUsage.update({
                    where: { turnId },
                    data: {
                        ...f.tokens,
                        costMicroUsd: f.costMicroUsd,
                        over100k: f.over100k,
                        outcome: f.outcome,
                        counted: f.counted,
                        stopped: f.stopped,
                        failureReason: f.failureReason ?? null,
                        finishedAt: now,
                    },
                }),
            ]);
        });
    }
}
