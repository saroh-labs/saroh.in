import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminWaitlistService } from "./admin-waitlist.service";
import {
    DeleteWaitlistDto,
    ListWaitlistDto,
    OperationTargetsDto,
    StartOperationDto,
} from "./dto";

/**
 * The waitlist (admin console U11; marketing U30). An entry is personal data
 * (an email, a business, a city), so every route needs `waitlist:read`;
 * inviting and removing someone need `waitlist:invite` too. The public
 * signup is `POST /public/waitlist`.
 *
 * Opening-day invites (U31) are a durable bulk operation, as a job retry is:
 * a dry run first, then one row per entry under one idempotency key, so
 * sending twice sends nobody a second invite.
 */
@AdminRoutes()
export class AdminWaitlistController {
    constructor(
        private readonly waitlist: AdminWaitlistService,
        private readonly idempotency: IdempotencyService,
        private readonly operations: AdminOperationsService,
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

    /** What inviting these entries would do, changing nothing. */
    @Post("waitlist/invite/plan")
    @RequireAdminPermission(
        AdminPermission.WaitlistRead,
        AdminPermission.WaitlistInvite,
    )
    planInvite(@Body() dto: OperationTargetsDto) {
        return this.operations.plan("waitlist.invite", dto.ids);
    }

    /** Send the invites, as an operation the console follows. */
    @Post("waitlist/invite")
    @RequireAdminPermission(
        AdminPermission.WaitlistRead,
        AdminPermission.WaitlistInvite,
    )
    invite(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: StartOperationDto,
    ) {
        return this.operations.start({
            staff,
            kind: "waitlist.invite",
            targetIds: dto.ids,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
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
