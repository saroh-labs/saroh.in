import {
    Body,
    Controller,
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
import { BringInSectionDto, CopyStarterContentDto } from "./dto";
import {
    bringInSection,
    copyStarterContent,
    fillDetails,
    listDraftVersions,
    rollbackDraft,
    undoStarterContent,
} from "./starter-content";

/**
 * "Use this look with its starter content" (DEC-182), from a look's
 * Preview in Website › Style: the look set, and its showcase template's
 * pages copied into the draft (`starter-content.ts`), with the business's
 * details filled in when asked, and the Undo that puts the previous draft
 * back. Beside it (amended 22 Oct 2026): "Bring in my details" any time,
 * and the draft's previous versions, to roll back to or bring a section
 * in from. `site:update` and `section:write`.
 */
@Controller("organizations/:organizationId/sites/:siteId/starter-content")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class StarterContentController {
    /** Copy the look's showcase template into the draft. */
    @Post()
    @HttpCode(201)
    copy(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CopyStarterContentDto,
    ) {
        return copyStarterContent(ctx, siteId, dto.look, dto.fill ?? false);
    }

    /** "Bring in my details": sample words filled with the business's own. */
    @Post("fill")
    @HttpCode(200)
    fill(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return fillDetails(ctx, siteId);
    }

    /** The draft's previous versions, newest first. */
    @Get("versions")
    versions(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return listDraftVersions(ctx, siteId);
    }

    /** Roll the draft back to a previous version. */
    @Post("versions/:snapshotId/rollback")
    @HttpCode(200)
    rollback(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("snapshotId") snapshotId: string,
    ) {
        return rollbackDraft(ctx, siteId, snapshotId);
    }

    /** Copy one section of a previous version into the draft. */
    @Post("versions/:snapshotId/bring-in")
    @HttpCode(200)
    bringIn(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("snapshotId") snapshotId: string,
        @Body() dto: BringInSectionDto,
    ) {
        return bringInSection(
            ctx,
            siteId,
            snapshotId,
            dto.pageId,
            dto.sectionKey,
        );
    }

    /** Put back the draft a change replaced. */
    @Post(":snapshotId/undo")
    @HttpCode(200)
    undo(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("snapshotId") snapshotId: string,
    ) {
        return undoStarterContent(ctx, siteId, snapshotId);
    }
}
