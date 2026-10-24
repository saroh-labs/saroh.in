import { Controller, HttpCode, Param, Post, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { UpgradePromptsService } from "./upgrade-prompts";

/**
 * An upgrade prompt shown or pressed (#1197, DEC-187). The service
 * authorizes (`org:read`) and refuses an unknown key or action with a 400.
 */
@Controller("organizations/:organizationId/upgrade-prompts")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class UpgradePromptsController {
    constructor(private readonly prompts: UpgradePromptsService) {}

    @Post(":key/:action")
    @HttpCode(204)
    record(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
        @Param("action") action: string,
    ): Promise<void> {
        return this.prompts.record(ctx, key, action);
    }
}
