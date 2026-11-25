import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "../notifications/notifications.service";
import { HomeService } from "./home.service";

/**
 * The aggregated Home read model (#119). One request → the ranked next-actions
 * for the active Organization (± Project), so the client never fans out. Double-
 * guarded; the read respects the actor's role via the availability projection.
 */
@Controller("organizations/:organizationId/home")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class HomeController {
    constructor(
        private readonly home: HomeService,
        private readonly notifications: NotificationsService,
    ) {}

    /**
     * The shell's bell and badges (owner, 25 Nov 2026), read on every live
     * tick and after every save that moves them: counts alone, in one
     * call, instead of the rail's actions and the unread count apiece. A
     * role without notifications has none unread, as the bell always drew.
     */
    @Get("badges")
    @Header("Cache-Control", "no-store")
    async badges(@OrgContext() ctx: OrganizationContext) {
        const [unread, counts] = await Promise.all([
            this.notifications
                .unreadCount(ctx)
                .then((r) => r.count)
                .catch(() => 0),
            this.home.badges(this.input(ctx)),
        ]);
        return { unread, counts };
    }

    /**
     * `?parts=rail` was the shell's read (review #16), kept for an app
     * deployed before `badges`: the ranked actions
     * its badges count, without the sources only Home's page draws. Any
     * other value, or none, is the whole of Home.
     */
    @Get()
    get(
        @OrgContext() ctx: OrganizationContext,
        @Query("projectId") projectId?: string,
        @Query("parts") parts?: string,
    ) {
        const input = { ...this.input(ctx), projectId };
        return parts === "rail"
            ? this.home.rail(input)
            : this.home.build(input);
    }

    private input(ctx: OrganizationContext) {
        return {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            organizationRole: ctx.role,
            organizationRoleKey: ctx.roleKey,
            organizationActions: ctx.actions,
            edition: ctx.edition,
        };
    }
}
