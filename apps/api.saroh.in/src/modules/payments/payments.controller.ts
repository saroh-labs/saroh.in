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
import { ConnectProviderDto, CreateIntentDto } from "./dto";
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
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class PaymentsController {
    constructor(private readonly payments: PaymentsService) {}

    @Post("payment-providers")
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
}
