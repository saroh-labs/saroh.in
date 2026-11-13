import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../../common/guards/organization.guard";
import type { OrganizationContext } from "../../../common/types/organization-context";
import type { AiRequestView } from "./ai-requests.service";
import { AiRequestsService } from "./ai-requests.service";

/**
 * Ask AI's Request more (plan 2026-11-13-001 U7): asked at the question
 * allowance by whoever may see the plan (Owner and Admin by default); a
 * Member is told whom to ask instead. Saroh's console decides (U8).
 */
@Controller("organizations/:organizationId/ask-ai")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AskAiRequestsController {
    constructor(private readonly requests: AiRequestsService) {}

    @Post("request-more")
    @HttpCode(200)
    requestMore(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<AiRequestView> {
        return this.requests.requestMore(ctx);
    }
}
