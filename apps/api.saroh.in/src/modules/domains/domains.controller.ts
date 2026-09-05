import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { DomainsService } from "./domains.service";
import { ClaimDomainDto } from "./dto";

/**
 * Domain claim + verification endpoints for an Organization (S2-007), scoped to
 * `/organizations/:organizationId/domains`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces the `domain:manage` policy on top.
 */
@Controller("organizations/:organizationId/domains")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class DomainsController {
    constructor(private readonly domains: DomainsService) {}

    @Post()
    @HttpCode(201)
    claim(@OrgContext() ctx: OrganizationContext, @Body() dto: ClaimDomainDto) {
        return this.domains.claim(ctx, dto);
    }

    @Post(":domainId/verify")
    verify(
        @OrgContext() ctx: OrganizationContext,
        @Param("domainId") domainId: string,
    ) {
        return this.domains.verify(ctx, domainId);
    }

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.domains.list(ctx);
    }

    @Delete(":domainId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("domainId") domainId: string,
    ) {
        return this.domains.remove(ctx, domainId);
    }
}
