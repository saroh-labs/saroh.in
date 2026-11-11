import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import type { ApiUsageView } from "@saroh/api-contract";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ApiUsageService } from "./api-usage.service";

/**
 * Settings › API and AI apps › Usage (plan 2026-11-10-001, U14): this
 * business's caps and this minute's calls. Every member may read it; what
 * they see is narrowed in the service. Never cached: it is this minute's.
 */
@Controller("organizations/:organizationId/api-usage")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ApiUsageController {
    constructor(private readonly usage: ApiUsageService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    read(@OrgContext() ctx: OrganizationContext): Promise<ApiUsageView> {
        return this.usage.read(ctx);
    }
}
