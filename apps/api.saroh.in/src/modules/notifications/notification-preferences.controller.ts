import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { UpdateAlertDto } from "./notification-preferences.dto";
import type { AlertPreferencesView } from "./notification-preferences.service";
import { NotificationPreferencesService } from "./notification-preferences.service";

/**
 * The signed-in person's own alerts in this business (round-2 F14),
 * Settings › Your profile. There is no user id in the path: it is always
 * the session's, so nobody can read or change another person's.
 *
 * Not module-gated: the rows each belong to a module, and a module that is
 * off simply has no row (`NotificationPreferencesService`).
 */
@Controller("organizations/:organizationId/me/alerts")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class NotificationPreferencesController {
    constructor(private readonly preferences: NotificationPreferencesService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<AlertPreferencesView> {
        return this.preferences.read(ctx);
    }

    @Patch()
    update(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: UpdateAlertDto,
    ): Promise<AlertPreferencesView> {
        return this.preferences.update(ctx, dto);
    }
}
