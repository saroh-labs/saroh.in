import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";
import type {
    AskAiConfirmBody,
    AskAiDraftContent,
    AskAiDraftResult,
    AskAiHandOff,
} from "@saroh/api-contract";
import { askAiConfirmBody } from "@saroh/api-contract";

import { LifecycleWrite } from "../../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../../common/guards/organization.guard";
import { ZodContractPipe } from "../../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { ACCESS_SESSION_HEADER } from "../../admin/organization-access-session.guard";
import { refuseStaff } from "../ask-ai.controller";
import { DraftsService } from "./drafts.service";

/**
 * Ask AI's drafts (plan 2026-11-13-001 U5): Confirm, Undo and Draft again
 * on a card. Each takes only the draft's id; the draft is the asker's own
 * in the business they have open, any other a 404. The origin check
 * (`OriginGuard`, global) applies as on every write. A refusal is a 200
 * with `outcome: "refused"`, worded for the card.
 *
 * Confirm and Undo are `wind-down` at the route: each tool's save checks
 * the business's lifecycle itself, so a closing business can still move
 * an order on, as it can in the app.
 */
@Controller("organizations/:organizationId/ask-ai/drafts")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AskAiDraftsController {
    constructor(private readonly drafts: DraftsService) {}

    /** Saves the draft; the body holds only the fields the card asked for. */
    @Post(":draftId/confirm")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    confirm(
        @OrgContext() ctx: OrganizationContext,
        @Param("draftId") draftId: string,
        @Body(new ZodContractPipe(askAiConfirmBody)) body: AskAiConfirmBody,
    ): Promise<AskAiDraftResult> {
        return this.drafts.confirm(ctx, draftId, body);
    }

    @Post(":draftId/undo")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    undo(
        @OrgContext() ctx: OrganizationContext,
        @Param("draftId") draftId: string,
    ): Promise<AskAiDraftResult> {
        return this.drafts.undo(ctx, draftId);
    }

    /** Draft again: free, a few times a conversation. */
    @Post(":draftId/redraft")
    @HttpCode(200)
    redraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("draftId") draftId: string,
    ): Promise<AskAiDraftResult> {
        return this.drafts.redraft(ctx, draftId);
    }

    /**
     * Open in editor (owner, 14 Nov): marks a blog draft handed to the
     * post editor and answers its website. Nothing is saved here.
     */
    @Post(":draftId/hand-off")
    @HttpCode(200)
    handOff(
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @OrgContext() ctx: OrganizationContext,
        @Param("draftId") draftId: string,
    ): Promise<AskAiHandOff> {
        refuseStaff(session);
        return this.drafts.handOff(ctx, draftId);
    }

    /** A blog draft as the post editor starts from it. */
    @Get(":draftId/content")
    content(
        @Headers(ACCESS_SESSION_HEADER) session: string | undefined,
        @OrgContext() ctx: OrganizationContext,
        @Param("draftId") draftId: string,
    ): Promise<AskAiDraftContent> {
        refuseStaff(session);
        return this.drafts.content(ctx, draftId);
    }
}
