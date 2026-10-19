import { Body, Get, Header, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import {
    CommissionMonthQueryDto,
    MarkPayoutPaidDto,
    SetCommissionRateDto,
} from "./admin-commission.dto";
import { AdminCommissionService } from "./admin-commission.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";

/**
 * Commission (DEC-169, admin console U21): statements, Mark paid, a
 * teammate's earnings and the export need `team:pay` (Platform owner and
 * Billing); the rates need `commission:rates` (Platform owner). The
 * service checks each again. Writes take a reason and an idempotency key
 * and are on the admin ledger. No support session: it is Saroh's own
 * money, not a business's data.
 */
@AdminRoutes()
export class AdminCommissionController {
    constructor(
        private readonly commission: AdminCommissionService,
        private readonly idempotency: IdempotencyService,
    ) {}

    /** The month's statement for the whole team (this month by default). */
    @Get("team/payouts")
    @RequireAdminPermission(AdminPermission.TeamPay)
    statement(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: CommissionMonthQueryDto,
    ) {
        return this.commission.statement(staff, query.month);
    }

    /** The month's statement as a CSV, one row per line. */
    @Get("team/payouts/export")
    @RequireAdminPermission(AdminPermission.TeamPay)
    @Header("content-type", "text/csv; charset=utf-8")
    async export(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: CommissionMonthQueryDto,
    ) {
        return (await this.commission.exportCsv(staff, query.month)).csv;
    }

    /** Mark a teammate's month paid, with the payment's reference. */
    @Post("team/payouts")
    @RequireAdminPermission(AdminPermission.TeamPay)
    markPaid(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: MarkPayoutPaidDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.commission.payout",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            input,
            () => this.commission.markPaid(staff, input),
        );
    }

    /** One teammate's earnings, for their page. */
    @Get("staff/:platformAdminId/earnings")
    @RequireAdminPermission(AdminPermission.TeamPay)
    earnings(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
    ) {
        return this.commission.earnings(staff, platformAdminId);
    }

    /** The rates in force, those to come, and every one set. */
    @Get("commission/rates")
    @RequireAdminPermission(AdminPermission.CommissionRates)
    rates(@PlatformAdminContext() staff: PlatformAdminInfo) {
        return this.commission.rates(staff);
    }

    /** Set a kind's rate from now, or a later date. */
    @Post("commission/rates")
    @RequireAdminPermission(AdminPermission.CommissionRates)
    setRate(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: SetCommissionRateDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.commission.rate",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            input,
            () => this.commission.setRate(staff, input),
        );
    }
}
