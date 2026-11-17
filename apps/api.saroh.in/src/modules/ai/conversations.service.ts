import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiMessageRole, AiTurnOutcome } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AiMessageContent } from "./history/sealing";
import {
    openAiText,
    openDraftBody,
    openMessageBody,
    sealedParts,
} from "./history/sealing";

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
    /** Where it started (AF 9); null: about the whole business. */
    about: { kind: string; label: string } | null;
    /** What was done from it, from its confirmed drafts ("booked 1"). */
    done?: string | null;
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
    aboutCiphertext: true,
    aboutIv: true,
    aboutAuthTag: true,
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
    aboutCiphertext: string | null;
    aboutIv: string | null;
    aboutAuthTag: string | null;
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
        about: openAbout(row),
        lastMessageAt: row.lastMessageAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
    };
}

/** Where a conversation started, opened; a row from before has none. */
function openAbout(row: {
    id: string;
    organizationId: string;
    aboutCiphertext: string | null;
    aboutIv: string | null;
    aboutAuthTag: string | null;
}): { kind: string; label: string } | null {
    const sealed = sealedParts(
        row.aboutCiphertext,
        row.aboutIv,
        row.aboutAuthTag,
    );
    if (!sealed) return null;
    const about = JSON.parse(
        openAiText(sealed, {
            organizationId: row.organizationId,
            conversationId: row.id,
            rowId: row.id,
            field: "about",
        }),
    ) as { kind: string; label: string };
    return { kind: about.kind, label: about.label };
}

interface DoneDraft {
    tool: string;
    /** Records it touched: several orders moved at once count each. */
    count: number;
    /** An order step's new step ("ready"). */
    stage?: string;
}

const DONE: Readonly<
    Partial<Record<string, (n: number, stage?: string) => string>>
> = {
    create_booking: (n) => `booked ${n}`,
    move_booking: (n) => `moved ${n}`,
    create_order: (n) => (n === 1 ? "order created" : `${n} orders created`),
    update_order_status: (n, stage) =>
        stage ? `${n} marked ${stage}` : `${n} moved on`,
    update_orders_status: (n, stage) =>
        stage ? `${n} marked ${stage}` : `${n} moved on`,
    create_product: () => "added",
    create_service: () => "added",
    create_customer: () => "customer added",
    draft_blog_post: () => "draft saved",
};

/** "booked 1", "3 marked ready", "order created · changed"; null for none. */
export function doneWords(drafts: readonly DoneDraft[]): string | null {
    const sums = new Map<string, DoneDraft>();
    for (const d of drafts) {
        const key = `${d.tool}:${d.stage ?? ""}`;
        const had = sums.get(key);
        sums.set(key, { ...d, count: (had?.count ?? 0) + d.count });
    }
    const words = [...sums.values()].map(
        (d) => DONE[d.tool]?.(d.count, d.stage) ?? "changed",
    );
    const unique = [...new Set(words)];
    return unique.length ? unique.slice(0, 2).join(" · ") : null;
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
        const done = await this.doneIn(
            ctx,
            rows.map((r) => r.id),
        );
        return rows.map((r) => ({
            ...summary(r),
            done: done.get(r.id) ?? null,
        }));
    }

    /**
     * What each conversation's confirmed drafts did (AF 9), in a few
     * words; an undone one isn't counted. An order step's card is opened
     * to say which step.
     */
    private async doneIn(
        ctx: OrganizationContext,
        ids: string[],
    ): Promise<Map<string, string>> {
        if (!ids.length) return new Map();
        const org = ctx.organizationId;
        const drafts = await outsideOrgContext(() =>
            runInOrgContext(org, () =>
                prisma.askAiDraft.findMany({
                    where: {
                        organizationId: org,
                        userId: ctx.userId,
                        conversationId: { in: ids },
                        status: "CONFIRMED",
                    },
                    orderBy: { confirmedAt: "asc" },
                    select: {
                        id: true,
                        conversationId: true,
                        tool: true,
                        targetId: true,
                        bodyCiphertext: true,
                        bodyIv: true,
                        bodyAuthTag: true,
                    },
                }),
            ),
        );
        const by = new Map<string, DoneDraft[]>();
        for (const d of drafts) {
            let stage: string | undefined;
            if (d.tool.startsWith("update_order")) {
                try {
                    const body = openDraftBody<{
                        card: { fields: { field: string; new: unknown }[] };
                    }>(
                        {
                            ciphertext: d.bodyCiphertext,
                            iv: d.bodyIv,
                            authTag: d.bodyAuthTag,
                        },
                        {
                            organizationId: org,
                            conversationId: d.conversationId,
                            rowId: d.id,
                        },
                    );
                    const s = body.card.fields.find((f) => f.field === "stage");
                    stage = typeof s?.new === "string" ? s.new : undefined;
                } catch {
                    stage = undefined;
                }
            }
            const list = by.get(d.conversationId) ?? [];
            list.push({
                tool: d.tool,
                count: d.targetId ? d.targetId.split(",").length : 1,
                stage,
            });
            by.set(d.conversationId, list);
        }
        const out = new Map<string, string>();
        for (const [id, list] of by) {
            const words = doneWords(list);
            if (words) out.set(id, words);
        }
        return out;
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
