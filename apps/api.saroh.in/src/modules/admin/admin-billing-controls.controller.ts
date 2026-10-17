import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminBillingActionsService } from "./admin-billing-actions.service";
import {
    ListBillingActionsDto,
    ListProviderEventsDto,
    RecordRefundDto,
} from "./admin-billing-controls.dto";
import { AdminBillingControlsService } from "./admin-billing-controls.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { OperatorReasonDto } from "./dto";

/**
 * Admin › Billing's queue and controls (DEC-166). Reads need
 * `saroh-billing:read`; every write needs `saroh-billing:act` (Platform
 * Owners and Billing), a reason and an idempotency key, is a POST (never a
 * GET that changes anything) and goes on the admin ledger. The services
 * check the permission again. No support-access session: this is Saroh's
 * own billing of the business, not the business's data.
 */
@AdminRoutes()
export class AdminBillingControlsController {
    constructor(
        private readonly actions: AdminBillingActionsService,
        private readonly controls: AdminBillingControlsService,
        private readonly adminAudit: AdminAuditService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("billing/actions")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    async listActions(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListBillingActionsDto,
    ) {
        const page = await this.actions.list(staff, query);
        await this.read(staff, "billing.actions.list", "billing_action", {
            state: query.state ?? "open",
            resultCount: page.items.length,
        });
        return page;
    }

    @Post("billing/actions/:actionId/resolve")
    @RequireAdminPermission(AdminPermission.SarohBillingAct)
    resolveAction(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("actionId") actionId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once("billing.action.resolve", staff, actionId, dto, () =>
            this.actions.resolve(staff, actionId, dto.reason),
        );
    }

    @Get("billing/events")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    async listEvents(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListProviderEventsDto,
    ) {
        const page = await this.actions.events(staff, query);
        await this.read(staff, "billing.events.list", "billing_webhook_event", {
            filter: query.filter ?? "all",
            resultCount: page.items.length,
        });
        return page;
    }

    @Post("billing/subscriptions/:subscriptionId/end-autopay")
    @RequireAdminPermission(AdminPermission.SarohBillingAct)
    endAutopay(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("subscriptionId") subscriptionId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "billing.autopay.end",
            staff,
            subscriptionId,
            dto,
            () => this.controls.endAutopay(staff, subscriptionId, dto.reason),
        );
    }

    @Post("billing/refunds/:providerPaymentId/recheck")
    @RequireAdminPermission(AdminPermission.SarohBillingAct)
    recheckRefund(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("providerPaymentId") providerPaymentId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "billing.refund.recheck",
            staff,
            providerPaymentId,
            dto,
            () =>
                this.controls.recheckRefund(
                    staff,
                    providerPaymentId,
                    dto.reason,
                ),
        );
    }

    @Post("billing/organizations/:organizationId/customer/sync")
    @RequireAdminPermission(AdminPermission.SarohBillingAct)
    syncCustomer(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "billing.customer.sync",
            staff,
            organizationId,
            dto,
            () => this.controls.syncCustomer(staff, organizationId, dto.reason),
        );
    }

    @Post("billing/invoices/:invoiceId/refunds")
    @RequireAdminPermission(AdminPermission.SarohBillingAct)
    recordRefund(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("invoiceId") invoiceId: string,
        @Body() dto: RecordRefundDto,
    ) {
        return this.once("billing.refund.record", staff, invoiceId, dto, () =>
            this.controls.recordRefund(staff, invoiceId, {
                providerPaymentId: dto.providerPaymentId,
                providerRefundId: dto.providerRefundId,
                amountPaise: dto.amountPaise,
                reason: dto.reason,
            }),
        );
    }

    /** A successful read on the admin ledger; an audit outage is logged. */
    private read(
        staff: PlatformAdminInfo,
        action: string,
        targetType: string,
        metadata: Record<string, unknown>,
    ) {
        return this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.SarohBillingRead,
            action,
            targetType,
            outcome: AdminAuditOutcome.Success,
            metadata,
        });
    }

    /** One write per idempotency key; a retry replays its answer. */
    private once<T, P extends { idempotencyKey: string }>(
        scope: string,
        staff: PlatformAdminInfo,
        target: string,
        payload: P,
        run: () => Promise<T>,
    ) {
        const { idempotencyKey, ...fingerprint } = payload;
        return this.idempotency.run(
            {
                scope: `admin.${scope}`,
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { target, ...fingerprint },
            run,
        );
    }
}
