import {
    Controller,
    Get,
    Header,
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
import type {
    PublishRequestAnswer,
    PublishRequestView,
} from "./publish-requests.service";
import { PublishRequestsService } from "./publish-requests.service";

/**
 * A publish an AI app prepared, answered by a person in Saroh (DEC-215 as
 * amended 12 Nov 2026). `:requestId` is the request's token from the link
 * `preview_publish` gave; it acts on nothing by itself. Every route needs a
 * signed-in member with `site:publish` (checked in the service); reading
 * never answers it, only a POST does.
 */
@Controller("organizations/:organizationId/sites/:siteId/publish-requests")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class PublishRequestsController {
    constructor(private readonly requests: PublishRequestsService) {}

    @Get(":requestId")
    @Header("Cache-Control", "no-store")
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("requestId") requestId: string,
    ): Promise<PublishRequestView> {
        return this.requests.read(ctx, siteId, requestId);
    }

    @Post(":requestId/confirm")
    @HttpCode(200)
    confirm(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("requestId") requestId: string,
    ): Promise<PublishRequestAnswer> {
        return this.requests.confirm(ctx, siteId, requestId);
    }

    @Post(":requestId/decline")
    @HttpCode(200)
    decline(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("requestId") requestId: string,
    ): Promise<PublishRequestAnswer> {
        return this.requests.decline(ctx, siteId, requestId);
    }
}
