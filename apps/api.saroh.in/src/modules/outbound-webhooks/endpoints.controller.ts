import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";
import type {
    CreatedWebhookEndpoint,
    CreateWebhookEndpointBody,
    UpdateWebhookEndpointBody,
    WebhookDeliveryList,
    WebhookDeliveryView,
    WebhookEndpointList,
    WebhookEndpointView,
} from "@saroh/api-contract";
import {
    createWebhookEndpointBody,
    updateWebhookEndpointBody,
} from "@saroh/api-contract";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import { WebhookEndpointsService } from "./endpoints.service";

/**
 * Settings › API and AI apps › Webhooks (plan 2026-11-10-001, U13).
 * `webhook:manage`, the kill switch and the plan are checked in the
 * service. Never cached: a create or roll carries the secret, once.
 */
@Controller("organizations/:organizationId/webhooks")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class WebhookEndpointsController {
    constructor(private readonly endpoints: WebhookEndpointsService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    list(@OrgContext() ctx: OrganizationContext): Promise<WebhookEndpointList> {
        return this.endpoints.list(ctx);
    }

    @Post()
    @Header("Cache-Control", "no-store")
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body(new ZodContractPipe(createWebhookEndpointBody))
        body: CreateWebhookEndpointBody,
    ): Promise<CreatedWebhookEndpoint> {
        return this.endpoints.create(ctx, body);
    }

    @Patch(":endpointId")
    @Header("Cache-Control", "no-store")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
        @Body(new ZodContractPipe(updateWebhookEndpointBody))
        body: UpdateWebhookEndpointBody,
    ): Promise<WebhookEndpointView> {
        return this.endpoints.update(ctx, endpointId, body);
    }

    /** Stopping deliveries is never refused for a business that is closing. */
    @Delete(":endpointId")
    @LifecycleWrite("wind-down")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
    ): Promise<{ id: string }> {
        return this.endpoints.remove(ctx, endpointId);
    }

    @Post(":endpointId/roll")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    roll(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
    ): Promise<CreatedWebhookEndpoint> {
        return this.endpoints.roll(ctx, endpointId);
    }

    @Post(":endpointId/test")
    @HttpCode(202)
    test(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
    ): Promise<WebhookDeliveryView> {
        return this.endpoints.test(ctx, endpointId);
    }

    @Get(":endpointId/deliveries")
    @Header("Cache-Control", "no-store")
    deliveries(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
    ): Promise<WebhookDeliveryList> {
        return this.endpoints.deliveries(ctx, endpointId);
    }

    @Post(":endpointId/deliveries/:deliveryId/resend")
    @HttpCode(202)
    resend(
        @OrgContext() ctx: OrganizationContext,
        @Param("endpointId") endpointId: string,
        @Param("deliveryId") deliveryId: string,
    ): Promise<WebhookDeliveryView> {
        return this.endpoints.resend(ctx, endpointId, deliveryId);
    }
}
