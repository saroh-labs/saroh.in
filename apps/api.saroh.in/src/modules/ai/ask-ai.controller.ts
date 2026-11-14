import { randomUUID } from "node:crypto";

import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Headers,
    HttpCode,
    Logger,
    Param,
    Post,
    Put,
    Query,
    Res,
    UseGuards,
} from "@nestjs/common";
import type {
    AskAiConversationList,
    AskAiConversationsQuery,
    AskAiLanguageBody,
    AskAiLanguageSetting,
    AskAiPeopleUsage,
    AskAiSettings,
    AskAiSettingsBody,
    AskAiState,
    AskAiStopResult,
    AskAiTurnBody,
} from "@saroh/api-contract";
import {
    askAiConversationsQuery,
    askAiLanguageBody,
    askAiSettingsBody,
    askAiTurnBody,
} from "@saroh/api-contract";
import type { Response } from "express";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ACCESS_SESSION_HEADER } from "../admin/organization-access-session.guard";
import { AskAiService, sseFrame } from "./ask-ai.service";
import type { AiConversationView } from "./conversations.service";

/** A comment line every so often, so no proxy on the way closes a quiet stream. */
export const KEEPALIVE_MS = 15_000;

/**
 * A staff support-access session (view as the business) never asks or
 * reads Ask AI: a conversation is one person's own. Staff reach a business
 * through the admin routes with this header, not through these, so this
 * refuses the request that carries it here.
 */
function refuseStaff(session: string | undefined): void {
    if (session) {
        throw new ForbiddenException("Ask AI isn't open to a support session.");
    }
}

/**
 * Ask AI's panel (DEC-220, plan 2026-11-13-001 U9). Everything here is the
 * asker's own: their conversations, their turns, their language; another
 * member's, or another business's, is a 404. History stays readable with
 * Ask AI off. No `@RequireModule`: the `ASK_AI` switch, the plan's Ask AI
 * row and `ai:use` gate a question (`AskAiAccess`), and history must stay
 * readable whatever is switched off (`module-annotations.spec.ts`).
 *
 * A question answers as server-sent events. The turn is read to its end
 * whether or not the browser is still there, so an answer whose reader
 * went away is still saved and counted as answered; only Stop stops it.
 */
@Controller("organizations/:organizationId/ask-ai")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AskAiController {
    private readonly logger = new Logger(AskAiController.name);

    constructor(private readonly askAi: AskAiService) {}

    @Post("turns")
    async turn(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Body(new ZodContractPipe(askAiTurnBody)) body: AskAiTurnBody,
        @Res() res: Response,
    ): Promise<void> {
        refuseStaff(session);
        // A 404 (another person's conversation) answers before the stream opens.
        const begun = await this.askAi.begin(ctx, body);
        const turnId = randomUUID();

        res.status(200);
        res.setHeader("content-type", "text/event-stream; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.setHeader("x-accel-buffering", "no");
        res.flushHeaders();

        let open = true;
        res.on("close", () => {
            open = false;
        });
        const write = (chunk: string) => {
            if (open && !res.writableEnded) res.write(chunk);
        };
        const keepalive = setInterval(
            () => write(":keepalive\n\n"),
            KEEPALIVE_MS,
        );
        keepalive.unref();
        try {
            // Drained to the end even after the reader leaves: the runner
            // reads an early stop of its reader as Stop.
            for await (const event of this.askAi.stream(
                ctx,
                begun,
                body.question,
                turnId,
            )) {
                write(sseFrame(event));
            }
        } catch (error) {
            this.logger.error(
                `ask_ai_stream_failed turn=${turnId} error=${error instanceof Error ? error.name : "unknown"}`,
            );
            write(sseFrame({ type: "error", reason: "provider" }));
        } finally {
            clearInterval(keepalive);
            if (!res.writableEnded) res.end();
        }
    }

    /** Stop: the asker's own turn only. Allowed while the business winds down. */
    @Post("turns/:turnId/stop")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    stop(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Param("turnId") turnId: string,
    ): Promise<AskAiStopResult> {
        refuseStaff(session);
        return this.askAi.stop(ctx, turnId);
    }

    @Get("conversations")
    conversations(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Query(new ZodContractPipe(askAiConversationsQuery))
        query: AskAiConversationsQuery,
    ): Promise<AskAiConversationList> {
        refuseStaff(session);
        return this.askAi.list(ctx, query.cursor);
    }

    @Get("conversations/:conversationId")
    conversation(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Param("conversationId") conversationId: string,
    ): Promise<AiConversationView> {
        refuseStaff(session);
        return this.askAi.get(ctx, conversationId);
    }

    @Get("me/language")
    async language(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<AskAiLanguageSetting> {
        return { language: await this.askAi.language(ctx) };
    }

    @Put("me/language")
    @LifecycleWrite("wind-down")
    setLanguage(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Body(new ZodContractPipe(askAiLanguageBody)) body: AskAiLanguageBody,
    ): Promise<AskAiLanguageSetting> {
        refuseStaff(session);
        return this.askAi.setLanguage(ctx, body.language);
    }

    @Get("state")
    state(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
    ): Promise<AskAiState> {
        refuseStaff(session);
        return this.askAi.state(ctx);
    }

    /** The business's switch: Owner and Admin (`module:manage`). */
    @Get("settings")
    settings(@OrgContext() ctx: OrganizationContext): Promise<AskAiSettings> {
        return this.askAi.settings(ctx);
    }

    /** Who asked this period, counts only: Owner and Admin (`module:manage`). */
    @Get("usage/people")
    peopleUsage(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
    ): Promise<AskAiPeopleUsage> {
        refuseStaff(session);
        return this.askAi.peopleUsage(ctx);
    }

    @Put("settings")
    @LifecycleWrite("wind-down")
    setSettings(
        @OrgContext() ctx: OrganizationContext,
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @Body(new ZodContractPipe(askAiSettingsBody)) body: AskAiSettingsBody,
    ): Promise<AskAiSettings> {
        refuseStaff(session);
        return this.askAi.setSettings(ctx, body.on);
    }
}
