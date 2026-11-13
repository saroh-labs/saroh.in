import { Injectable, NotFoundException } from "@nestjs/common";
import type {
    AskAiConversationList,
    AskAiEvent,
    AskAiLanguage,
    AskAiState,
    AskAiTurnBody,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { meterWindow } from "../billing/metering";
import { allows, authorize } from "../organizations/organization-policy";
import { AskAiAccess, questionsUsed } from "./access/ask-ai-access";
import type { AskAiRefusal } from "./access/refusal";
import { ASK_AI_AGENT } from "./agents/ask-ai.agent";
import type { AiConversationView } from "./conversations.service";
import {
    CONVERSATIONS_LISTED,
    ConversationsService,
} from "./conversations.service";
import { AiSettingNotConfiguredError } from "./settings/ai-settings.service";
import type { TurnEvent } from "./turn/events";
import { TurnRegistry } from "./turn/turn-registry";
import { refusedTurn, TurnRunner } from "./turn/turn-runner";
import { TurnStore } from "./turn/turn-store";

/** What {@link AskAiService.begin} settled before the stream opens. */
export interface BegunTurn {
    conversationId: string | null;
    /** Set when a new conversation was refused before it began. */
    refusal: AskAiRefusal | null;
}

/** An event as written on the stream: the turn's own, plus `turn` first. */
export type AskAiStreamEvent =
    TurnEvent | { type: "turn"; turnId: string; conversationId: string | null };

/**
 * Ask AI's panel (DEC-220, plan 2026-11-13-001 U9): a question's events,
 * Stop, the person's own conversations and language, what the panel
 * shows before a question, and the business's switch. Who may ask is
 * `AskAiAccess`'s; the turn is `TurnRunner`'s.
 */
@Injectable()
export class AskAiService {
    constructor(
        private readonly runner: TurnRunner,
        private readonly registry: TurnRegistry,
        private readonly access: AskAiAccess,
        private readonly store: TurnStore,
        private readonly conversations: ConversationsService,
    ) {}

    /**
     * Everything that can still answer as an ordinary HTTP error: the
     * language saved, a continued conversation the asker's own (else 404).
     * A new conversation is opened only for someone who may ask, so a
     * refused question leaves no empty one behind.
     */
    async begin(
        ctx: OrganizationContext,
        body: AskAiTurnBody,
    ): Promise<BegunTurn> {
        if (body.language) await this.store.setLanguage(ctx, body.language);
        if (body.conversationId) {
            await this.conversations.assertOwn(ctx, body.conversationId);
            return { conversationId: body.conversationId, refusal: null };
        }
        const entry = await this.access.entry(ctx);
        if (!entry.ok) return { conversationId: null, refusal: entry.refusal };
        try {
            const c = await this.runner.openConversation(ctx, ASK_AI_AGENT.key);
            return { conversationId: c.id, refusal: null };
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) throw error;
            return { conversationId: null, refusal: { reason: "unavailable" } };
        }
    }

    /** The turn's events, `turn` first; Stop reaches it by `turnId` while it runs. */
    async *stream(
        ctx: OrganizationContext,
        begun: BegunTurn,
        question: string,
        turnId: string,
    ): AsyncGenerator<AskAiStreamEvent> {
        const first = {
            type: "turn" as const,
            turnId,
            conversationId: begun.conversationId,
        };
        if (begun.refusal || !begun.conversationId) {
            yield first;
            yield* refusedTurn(
                turnId,
                begun.refusal ?? { reason: "unavailable" },
            );
            return;
        }
        // Registered before `turn` is sent, so Stop works from the first event.
        const signal = this.registry.begin(ctx, turnId);
        try {
            yield first;
            yield* this.runner.run({
                ctx,
                conversationId: begun.conversationId,
                question,
                turnId,
                signal,
            });
        } finally {
            this.registry.end(turnId);
        }
    }

    /**
     * Stops the asker's own running turn. Their own turn that has already
     * ended answers `stopped: false`; anyone else's, or none, is a 404.
     */
    async stop(
        ctx: OrganizationContext,
        turnId: string,
    ): Promise<{ stopped: boolean }> {
        if (this.registry.stop(ctx, turnId)) return { stopped: true };
        const mine = await prisma.aiUsage.findFirst({
            where: {
                turnId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
            select: { id: true },
        });
        if (!mine) throw new NotFoundException("That question isn't here");
        return { stopped: false };
    }

    async list(
        ctx: OrganizationContext,
        cursor?: string,
    ): Promise<AskAiConversationList> {
        const data = await this.conversations.list(ctx, cursor);
        return {
            data,
            // A full page may have more after it.
            nextCursor: data[CONVERSATIONS_LISTED - 1]?.id ?? null,
        };
    }

    get(ctx: OrganizationContext, id: string): Promise<AiConversationView> {
        return this.conversations.get(ctx, id);
    }

    language(ctx: OrganizationContext): Promise<AskAiLanguage> {
        return this.store.language(ctx);
    }

    async setLanguage(
        ctx: OrganizationContext,
        language: AskAiLanguage,
    ): Promise<{ language: AskAiLanguage }> {
        await this.store.setLanguage(ctx, language);
        return { language };
    }

    /** The business's switch: `module:manage` (Owner and Admin), as a module's. */
    async settings(ctx: OrganizationContext): Promise<{ on: boolean }> {
        authorize(ctx, "module:manage");
        return { on: await this.store.businessOn(ctx.organizationId) };
    }

    async setSettings(
        ctx: OrganizationContext,
        on: boolean,
    ): Promise<{ on: boolean }> {
        authorize(ctx, "module:manage");
        await this.store.setBusinessOn(ctx, on);
        return { on };
    }

    /** What the panel shows before a question. */
    async state(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<AskAiState> {
        const org = ctx.organizationId;
        const [entry, language, businessOn] = await Promise.all([
            this.access.entry(ctx, now),
            this.store.language(ctx),
            this.store.businessOn(org),
        ]);
        const seesPlan = allows(ctx, "billing:read");
        let usage: AskAiState["usage"] = null;
        if (entry.ok) {
            const window = await meterWindow(prisma, org, now);
            usage = {
                used: await questionsUsed(prisma, org, window.start),
                limit: entry.row.limit,
                resetsAt: window.end.toISOString(),
            };
        }
        const refusal = entry.ok ? null : entry.refusal;
        return {
            available: entry.ok,
            reason:
                refusal?.reason === "unavailable" ||
                refusal?.reason === "locked" ||
                refusal?.reason === "no-permission" ||
                refusal?.reason === "business-off"
                    ? refusal.reason
                    : null,
            upgradeTo: refusal?.reason === "locked" ? refusal.upgradeTo : null,
            usage,
            requestMore: entry.ok && seesPlan && usage?.limit !== null,
            ownerName: seesPlan ? null : await this.access.ownerName(org),
            businessOn,
            canSwitch: allows(ctx, "module:manage"),
            language,
        };
    }
}

/** An event as one server-sent event frame. */
export function sseFrame(event: AskAiStreamEvent | AskAiEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
