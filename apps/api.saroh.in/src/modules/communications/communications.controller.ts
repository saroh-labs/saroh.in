import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CommunicationsService } from "./communications.service";
import {
    ConnectCommsProviderDto,
    SendMessageDto,
    SetAccountUpdatesDto,
    SetConsentDto,
    SetNoticeSettingDto,
} from "./dto";
import { NoticeSettingsService } from "./notice-settings.service";

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
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
export class CommunicationsController {
    constructor(
        private readonly comms: CommunicationsService,
        private readonly noticeSettings: NoticeSettingsService,
    ) {}

    // ---- Providers ----
    /*
     * Per METHOD. Consent is deliberately NOT gated: withdrawing consent is a
     * legal obligation and must keep working after Communications is switched
     * off, as must reading the delivery ledger for messages already sent.
     * What is gated is connecting a provider and sending something new.
     */
    @Post("comms-providers")
    @RequireModule("COMMUNICATIONS")
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

    /**
     * Whether the business has its own email provider, and if not whether
     * its plan lets it connect one (DEC-091): the workspace's prompt to
     * connect one. Not module-gated: it says what is true either way.
     */
    @Get("comms-providers/email-setup")
    emailSetup(@OrgContext() ctx: OrganizationContext) {
        return this.comms.emailSetup(ctx);
    }

    @Delete("comms-providers/:channel")
    @RequireModule("COMMUNICATIONS")
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
    @RequireModule("COMMUNICATIONS")
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

    // ---- Customer notices (A14) ----
    /**
     * How a notice about a customer's own booking or order reaches them:
     * one customer's (`?contactId=`), or the business's channels alone.
     * Not module-gated: it says what IS sent, which is also "nothing".
     */
    @Get("customer-notices/reach")
    noticeReach(
        @OrgContext() ctx: OrganizationContext,
        @Query("contactId") contactId?: string,
    ) {
        const id = contactId?.trim() ?? "";
        return this.comms.noticeReach(ctx, id === "" ? null : id);
    }

    /**
     * "Updates in your customers' Messages" (12 Oct 2026): whether Saroh
     * posts order, booking and invoice updates into a customer's account
     * thread for this business, whether that choice can have an effect
     * yet, and whether the business emails its customers itself.
     * `comms:manage`. Not module-gated: the thread is not Communications',
     * and turning it off must work with that module off.
     */
    @Get("customer-notices/account-updates")
    accountUpdates(@OrgContext() ctx: OrganizationContext) {
        return this.comms.accountUpdates(ctx);
    }

    @Patch("customer-notices/account-updates")
    setAccountUpdates(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetAccountUpdatesDto,
    ) {
        return this.comms.setAccountUpdates(ctx, dto.on);
    }

    /**
     * The business's switches for its automatic customer notices (DEC-174,
     * U1 #1132): each kind whose module is on, with whether it is on, its
     * default, and whether it can be changed now (and why not). Anyone in
     * the business reads it; changing one needs `comms:manage`. Not
     * module-gated, as "Updates in Messages": turning a notice off must
     * work with Communications off.
     */
    @Get("customer-notices/settings")
    noticeSettingsRead(@OrgContext() ctx: OrganizationContext) {
        return this.noticeSettings.read(ctx);
    }

    @Patch("customer-notices/settings")
    noticeSettingsUpdate(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetNoticeSettingDto,
    ) {
        return this.noticeSettings.update(ctx, { kind: dto.kind, on: dto.on });
    }
}
