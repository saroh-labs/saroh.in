import {
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "./notifications.service";

/**
 * In-app notification inbox for an Organization (S3-006), scoped to
 * `/organizations/:organizationId/notifications`.
 *
 * Double-guarded like the other org-scoped controllers: `BetterAuthGuard`
 * authenticates the session user and `OrganizationGuard` resolves an authorized
 * {@link OrganizationContext} from the `:organizationId` param. Handlers receive
 * only that proven context via `@OrgContext()`; the service enforces the
 * `notification:read` / `notification:write` policy on top.
 */
@Controller("organizations/:organizationId/notifications")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("unread") unread?: string,
    ) {
        return this.notifications.list(ctx, { unreadOnly: unread === "true" });
    }

    @Get("unread-count")
    unreadCount(@OrgContext() ctx: OrganizationContext) {
        return this.notifications.unreadCount(ctx);
    }

    @Post("read-all")
    @HttpCode(200)
    markAllRead(@OrgContext() ctx: OrganizationContext) {
        return this.notifications.markAllRead(ctx);
    }

    @Post(":id/read")
    @HttpCode(200)
    markRead(@OrgContext() ctx: OrganizationContext, @Param("id") id: string) {
        return this.notifications.markRead(ctx, id);
    }
}
