import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminWaitlistService } from "./admin-waitlist.service";
import { DeleteWaitlistDto, InviteWaitlistDto, ListWaitlistDto } from "./dto";

/**
 * The waitlist (admin console U11; marketing U30). An entry is personal data
 * (an email, a business, a city), so every route needs `waitlist:read`;
 * inviting and removing someone need `waitlist:invite` too. The public
 * signup is `POST /public/waitlist`.
 */
@AdminRoutes()
export class AdminWaitlistController {
    constructor(
        private readonly waitlist: AdminWaitlistService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("waitlist/summary")
    @RequireAdminPermission(AdminPermission.WaitlistRead)
    waitlistSummary() {
        return this.waitlist.summary();
    }

    @Get("waitlist")
    @RequireAdminPermission(AdminPermission.WaitlistRead)
    listWaitlist(@Query() query: ListWaitlistDto) {
        return this.waitlist.list(query);
    }

    @Post("waitlist/invite")
    @RequireAdminPermission(
        AdminPermission.WaitlistRead,
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

    /** Remove one entry when its owner asks (plan KTD-17). */
    @Post("waitlist/:id/remove")
    @RequireAdminPermission(
        AdminPermission.WaitlistRead,
        AdminPermission.WaitlistInvite,
    )
    removeFromWaitlist(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("id") id: string,
        @Body() dto: DeleteWaitlistDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.waitlist.remove",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { id, reason: dto.reason },
            () => this.waitlist.remove(staff, id, dto.reason),
        );
    }
}
