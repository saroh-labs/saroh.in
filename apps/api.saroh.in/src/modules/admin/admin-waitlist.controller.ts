import { Body, Get, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminWaitlistService } from "./admin-waitlist.service";
import { InviteWaitlistDto, ListWaitlistDto } from "./dto";

/**
 * The waitlist (admin console U11). A signup is an email address and
 * nothing else, so every route needs personal-data read; inviting needs its
 * own permission. The public signup (`POST /waitlist`) is unchanged.
 */
@AdminRoutes()
export class AdminWaitlistController {
    constructor(
        private readonly waitlist: AdminWaitlistService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("waitlist/summary")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    summary() {
        return this.waitlist.summary();
    }

    @Get("waitlist")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    list(@Query() query: ListWaitlistDto) {
        return this.waitlist.list(query);
    }

    @Post("waitlist/invite")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.WaitlistInvite,
    )
    invite(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: InviteWaitlistDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.waitlist.invite",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { ids: [...dto.ids].sort(), reason: dto.reason },
            () => this.waitlist.invite(staff, dto.ids, dto.reason),
        );
    }
}
