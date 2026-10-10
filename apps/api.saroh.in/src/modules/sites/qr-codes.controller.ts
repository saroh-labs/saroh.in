import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CreateQrCodeDto, UpdateQrCodeDto } from "./qr-codes.dto";
import type { QrCodesView, QrCodeView } from "./qr-codes.service";
import { QrCodesService } from "./qr-codes.service";

/**
 * A site's QR codes, for Settings › Share: each a short link on the
 * site's Saroh address that counts its scans and can be pointed somewhere
 * new without reprinting.
 */
@Controller("organizations/:organizationId/sites/:siteId/qr-codes")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class QrCodesController {
    constructor(private readonly codes: QrCodesService) {}

    /** The site's codes with their scans. `site:read`. */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ): Promise<QrCodesView> {
        return this.codes.list(ctx, siteId);
    }

    /** Make a code. `site:update`. */
    @Post()
    create(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CreateQrCodeDto,
    ): Promise<QrCodeView> {
        return this.codes.create(ctx, siteId, dto);
    }

    /** Point a code somewhere new, or change how it looks. `site:update`. */
    @Patch(":qrCodeId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("qrCodeId") qrCodeId: string,
        @Body() dto: UpdateQrCodeDto,
    ): Promise<QrCodeView> {
        return this.codes.update(ctx, siteId, qrCodeId, dto);
    }

    /** Retire a code; its scans are kept. `site:update`. */
    @Post(":qrCodeId/retire")
    @HttpCode(200)
    retire(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("qrCodeId") qrCodeId: string,
    ): Promise<QrCodeView> {
        return this.codes.retire(ctx, siteId, qrCodeId);
    }
}
