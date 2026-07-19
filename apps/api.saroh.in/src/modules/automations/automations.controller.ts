import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import type { AutomationRule } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AutomationsService } from "./automations.service";
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from "./dto";

/**
 * Automation-rule endpoints for an Organization (S6-003), scoped to
 * `/organizations/:organizationId/automations`.
 *
 * Double-guarded (`BetterAuthGuard` + `OrganizationGuard`); handlers receive
 * only a proven {@link OrganizationContext} via `@OrgContext()`. Every operation
 * requires `automation:manage` (OWNER/ADMIN-only) — enforced in the service.
 */
@Controller("organizations/:organizationId/automations")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AutomationsController {
    constructor(private readonly automations: AutomationsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext): Promise<AutomationRule[]> {
        return this.automations.list(ctx);
    }

    @Get(":ruleId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("ruleId") ruleId: string,
    ): Promise<AutomationRule> {
        return this.automations.get(ctx, ruleId);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateAutomationRuleDto,
    ): Promise<AutomationRule> {
        return this.automations.create(ctx, dto);
    }

    @Patch(":ruleId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("ruleId") ruleId: string,
        @Body() dto: UpdateAutomationRuleDto,
    ): Promise<AutomationRule> {
        return this.automations.update(ctx, ruleId, dto);
    }

    @Delete(":ruleId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("ruleId") ruleId: string,
    ) {
        return this.automations.remove(ctx, ruleId);
    }
}
