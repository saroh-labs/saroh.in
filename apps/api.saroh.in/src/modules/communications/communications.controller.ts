import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "./communications.service";
import { ConnectCommsProviderDto, SendMessageDto, SetConsentDto } from "./dto";

/**
 * Org communications endpoints (S6-001), scoped to
 * `/organizations/:organizationId`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces `comms:manage` / `message:*` /
 * `consent:*` on top. Provider credentials are inbound-only and never echoed.
 */
@Controller("organizations/:organizationId")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CommunicationsController {
    constructor(private readonly comms: CommunicationsService) {}

    // ---- Providers ----
    @Post("comms-providers")
    @HttpCode(201)
    connect(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ConnectCommsProviderDto,
    ) {
        return this.comms.connectProvider(ctx, dto);
    }

    @Get("comms-providers")
    listProviders(@OrgContext() ctx: OrganizationContext) {
        return this.comms.listProviders(ctx);
    }

    @Delete("comms-providers/:channel")
    disconnect(
        @OrgContext() ctx: OrganizationContext,
        @Param("channel") channel: string,
    ) {
        return this.comms.disconnectProvider(ctx, channel);
    }

    // ---- Consent ----
    @Post("consents")
    @HttpCode(201)
    setConsent(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetConsentDto,
    ) {
        return this.comms.setConsent(ctx, dto);
    }

    @Get("consents")
    listConsents(
        @OrgContext() ctx: OrganizationContext,
        @Query("contactId") contactId?: string,
    ) {
        return this.comms.listConsents(ctx, contactId);
    }

    @Get("consents/:contactId/:channel")
    getConsent(
        @OrgContext() ctx: OrganizationContext,
        @Param("contactId") contactId: string,
        @Param("channel") channel: string,
    ) {
        return this.comms.getConsent(ctx, contactId, channel);
    }

    // ---- Messages ----
    @Post("messages")
    @HttpCode(201)
    send(@OrgContext() ctx: OrganizationContext, @Body() dto: SendMessageDto) {
        return this.comms.sendMessage(ctx, dto);
    }

    @Get("messages")
    listMessages(
        @OrgContext() ctx: OrganizationContext,
        @Query("leadId") leadId?: string,
        @Query("contactId") contactId?: string,
    ) {
        return this.comms.listMessages(ctx, { leadId, contactId });
    }

    @Get("messages/:messageId")
    getMessage(
        @OrgContext() ctx: OrganizationContext,
        @Param("messageId") messageId: string,
    ) {
        return this.comms.getMessage(ctx, messageId);
    }
}
