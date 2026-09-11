import {
    Body,
    Controller,
    Delete,
    Get,
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
import { ConnectProviderDto, CreateIntentDto, RefundOrderDto } from "./dto";
import { PaymentsService } from "./payments.service";

/**
 * Org merchant-payments endpoints (S5-002), scoped to
 * `/organizations/:organizationId`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces `payment:manage` / `payment:read` on
 * top. Provider secrets are inbound-only and never echoed back.
 */
@Controller("organizations/:organizationId")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
export class PaymentsController {
    constructor(private readonly payments: PaymentsService) {}

    /*
     * Annotated per METHOD, not on the controller. The runbook forbids gating
     * refunds and payment status on a module: money already taken must stay
     * refundable and reconcilable after Payments is switched off. Connecting
     * and disconnecting a provider are new commands, which is exactly what the
     * rollout says to annotate first.
     */
    @Post("payment-providers")
    @RequireModule("PAYMENTS")
    @HttpCode(201)
    connect(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ConnectProviderDto,
    ) {
        return this.payments.connectProvider(ctx, dto);
    }

    @Get("payment-providers")
    list(@OrgContext() ctx: OrganizationContext) {
        return this.payments.listProviders(ctx);
    }

    @Delete("payment-providers/:provider")
    @RequireModule("PAYMENTS")
    disconnect(
        @OrgContext() ctx: OrganizationContext,
        @Param("provider") provider: string,
    ) {
        return this.payments.disconnectProvider(ctx, provider);
    }

    @Post("orders/:orderId/payment-intent")
    @HttpCode(201)
    createIntent(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: CreateIntentDto,
    ) {
        return this.payments.createIntentForOrder(ctx, orderId, {
            idempotencyKey: dto.idempotencyKey,
            provider: dto.provider,
        });
    }

    @Get("orders/:orderId/payments")
    listOrderPayments(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
    ) {
        return this.payments.listOrderPayments(ctx, orderId);
    }

    @Post("orders/:orderId/refund")
    @HttpCode(201)
    refund(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: RefundOrderDto,
    ) {
        return this.payments.initiateRefund(ctx, orderId, dto.reason);
    }
}
