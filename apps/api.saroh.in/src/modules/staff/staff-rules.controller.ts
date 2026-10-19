import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { TurnDownRuleRequestDto, UpdatePersonRulesDto } from "./dto";
import type {
    PersonRulesSaved,
    PersonRulesView,
    RuleRequestView,
} from "./staff-rules-view";
import { StaffRulesService } from "./staff-rules.service";

/**
 * Each person's own booking rules (DEC-170, #1038). Reading needs
 * `service:read`; changing anyone's `service:write`, and one's own
 * `hours:write` — a request while the business's approval switch is on.
 * Decided in {@link StaffRulesService}.
 */
@Controller("organizations/:organizationId/staff/:staffId/booking-rules")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class StaffRulesController {
    constructor(private readonly rules: StaffRulesService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
    ): Promise<PersonRulesView> {
        return this.rules.read(ctx, staffId);
    }

    /** Applied at once, or a request waiting for approval: `applied` says. */
    @Put()
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("staffId") staffId: string,
        @Body() dto: UpdatePersonRulesDto,
    ): Promise<PersonRulesSaved> {
        return this.rules.update(ctx, staffId, dto);
    }
}

/**
 * Requests to change someone's own booking rules (DEC-170, #1038): the
 * waiting list, Approve and Turn down (`service:write`), and Withdraw and
 * the OK on an outcome (the person who asked).
 */
@Controller("organizations/:organizationId/booking-rule-requests")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("APPOINTMENTS")
export class RuleRequestsController {
    constructor(private readonly rules: StaffRulesService) {}

    @Get()
    waiting(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<RuleRequestView[]> {
        return this.rules.waiting(ctx);
    }

    @Post(":requestId/approve")
    @HttpCode(200)
    approve(
        @OrgContext() ctx: OrganizationContext,
        @Param("requestId") requestId: string,
    ): Promise<RuleRequestView> {
        return this.rules.approve(ctx, requestId);
    }

    @Post(":requestId/turn-down")
    @HttpCode(200)
    turnDown(
        @OrgContext() ctx: OrganizationContext,
        @Param("requestId") requestId: string,
        @Body() dto: TurnDownRuleRequestDto,
    ): Promise<RuleRequestView> {
        return this.rules.turnDown(ctx, requestId, dto.reason);
    }

    @Post(":requestId/withdraw")
    @HttpCode(200)
    withdraw(
        @OrgContext() ctx: OrganizationContext,
        @Param("requestId") requestId: string,
    ): Promise<RuleRequestView> {
        return this.rules.withdraw(ctx, requestId);
    }

    @Post(":requestId/dismiss")
    @HttpCode(200)
    dismiss(
        @OrgContext() ctx: OrganizationContext,
        @Param("requestId") requestId: string,
    ): Promise<RuleRequestView> {
        return this.rules.dismiss(ctx, requestId);
    }
}
