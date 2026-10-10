import {
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { DataExportList, DataExportView } from "./data-export.service";
import { DataExportService } from "./data-export.service";

/**
 * Settings › Your data (owner, 9 Oct, DEC-117): an owner downloads
 * everything the business keeps in Saroh as one zip. Owner only, checked
 * in the service. No module gates it and no lifecycle state short of
 * deleted closes it: a business that is closing or suspended can still
 * take its data away (`takeout`).
 */
@Controller("organizations/:organizationId/data-exports")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class DataExportController {
    constructor(private readonly exports: DataExportService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    list(@OrgContext() ctx: OrganizationContext): Promise<DataExportList> {
        return this.exports.list(ctx);
    }

    /** Start one, or answer with the one being made (`already`). */
    @Post()
    @LifecycleWrite("takeout")
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    request(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<{ export: DataExportView; already: boolean }> {
        return this.exports.request(ctx);
    }

    /** A fresh signed link to a ready export; each one is audited. */
    @Post(":exportId/link")
    @LifecycleWrite("takeout")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    link(
        @OrgContext() ctx: OrganizationContext,
        @Param("exportId") exportId: string,
    ): Promise<{ url: string; expiresAt: string }> {
        return this.exports.link(ctx, exportId);
    }
}
