import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import type {
    AiConnectionActivity,
    AiConnectionActivityQuery,
    AiConnectionRollback,
    AiConnectionRollbackBody,
} from "@saroh/api-contract";
import {
    aiConnectionActivityQuery,
    aiConnectionRollbackBody,
} from "@saroh/api-contract";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AiConnectionView } from "./ai-connections.service";
import { AiConnectionsService } from "./ai-connections.service";

/**
 * Settings › API and AI apps › AI apps (U9; the screen is U14): the AI apps
 * signed in to this business. Everyone sees and ends their own; ending
 * someone else's needs `apikey:manage` (the Owner), checked in the service.
 * Ending one here takes only this business off it; an app that also works
 * with the person's other businesses keeps those.
 */
@Controller("organizations/:organizationId/ai-connections")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AiConnectionsController {
    constructor(private readonly connections: AiConnectionsService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    list(@OrgContext() ctx: OrganizationContext): Promise<AiConnectionView[]> {
        return this.connections.list(ctx);
    }

    /** What this connection changed here, newest first, and the drafts it can roll back. */
    @Get(":connectionId/activity")
    @Header("Cache-Control", "no-store")
    activity(
        @OrgContext() ctx: OrganizationContext,
        @Param("connectionId") connectionId: string,
        @Query(new ZodContractPipe(aiConnectionActivityQuery))
        query: AiConnectionActivityQuery,
    ): Promise<AiConnectionActivity> {
        return this.connections.activity(ctx, connectionId, query);
    }

    /** Puts a website's draft back to before this connection's latest session. */
    @Post(":connectionId/roll-back")
    @HttpCode(200)
    rollBack(
        @OrgContext() ctx: OrganizationContext,
        @Param("connectionId") connectionId: string,
        @Body(new ZodContractPipe(aiConnectionRollbackBody))
        body: AiConnectionRollbackBody,
    ): Promise<AiConnectionRollback> {
        return this.connections.rollBack(ctx, connectionId, body.siteId);
    }

    /** Disconnecting is never refused for a business that is closing. */
    @Delete(":connectionId")
    @LifecycleWrite("wind-down")
    @HttpCode(204)
    async disconnect(
        @OrgContext() ctx: OrganizationContext,
        @Param("connectionId") connectionId: string,
    ): Promise<void> {
        await this.connections.disconnect(ctx, connectionId);
    }
}
