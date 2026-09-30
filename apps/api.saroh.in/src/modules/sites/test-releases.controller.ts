import {
    Body,
    Controller,
    Delete,
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
import {
    CreateTestReleaseDto,
    CreateTestReleaseLinkDto,
    ScheduleGoLiveDto,
    UpdateTestReleaseDto,
} from "./dto";
import { TestReleasesService } from "./test-releases.service";

/**
 * A site's test releases (DEC-071, T2), under
 * `/organizations/:organizationId/sites/:siteId/test-releases`.
 *
 * Guarded exactly as `SitesController` is: the session, the organization
 * from the path, and the WEBSITE module. Who may do each thing is the
 * service's `authorize` call, and the `SITE_TEST_RELEASES` flag answers 404
 * there too.
 */
@Controller("organizations/:organizationId/sites/:siteId/test-releases")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class TestReleasesController {
    constructor(private readonly releases: TestReleasesService) {}

    /** Freeze the draft into a test release, with a first link. `site:update`. */
    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CreateTestReleaseDto,
    ) {
        return this.releases.create(ctx, siteId, dto);
    }

    /** The site's test releases, newest first, with their links. `site:read`. */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.releases.list(ctx, siteId);
    }

    /**
     * Take a link back. `site:update`. Declared before the `:releaseId`
     * routes so "links" is never read as a release id.
     */
    @Post("links/:linkId/revoke")
    @HttpCode(200)
    revokeLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("linkId") linkId: string,
    ) {
        return this.releases.revokeLink(ctx, siteId, linkId);
    }

    /** Rename a test release, or change its note. `site:update`. */
    @Patch(":releaseId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
        @Body() dto: UpdateTestReleaseDto,
    ) {
        return this.releases.update(ctx, siteId, releaseId, dto);
    }

    /** Discard a test release; its links stop working. `site:update`. */
    @Post(":releaseId/discard")
    @HttpCode(200)
    discard(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
    ) {
        return this.releases.discard(ctx, siteId, releaseId);
    }

    /**
     * Go live now with exactly this release (R8). `site:publish`. 409 when it
     * is discarded, already live, scheduled, or can't be drawn.
     */
    @Post(":releaseId/go-live")
    @HttpCode(200)
    goLive(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
    ) {
        return this.releases.goLive(ctx, siteId, releaseId);
    }

    /**
     * Go live at a date and time in the business's zone (T10), or move the
     * time. `site:publish`; `override` is the owner's alone.
     */
    @Post(":releaseId/schedule")
    @HttpCode(200)
    schedule(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
        @Body() dto: ScheduleGoLiveDto,
    ) {
        return this.releases.schedule(ctx, siteId, releaseId, dto);
    }

    /** Cancel the scheduled go-live. `site:publish`. 409 once it is running. */
    @Delete(":releaseId/schedule")
    @HttpCode(200)
    cancelSchedule(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
    ) {
        return this.releases.cancelSchedule(ctx, siteId, releaseId);
    }

    /** A new link to share, lasting 1, 7 or 30 days. `site:update`. */
    @Post(":releaseId/links")
    @HttpCode(201)
    createLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
        @Body() dto: CreateTestReleaseLinkDto,
    ) {
        return this.releases.createLink(ctx, siteId, releaseId, dto);
    }

    /** A 12-hour link for the caller, to open it now. `site:read`. */
    @Post(":releaseId/open")
    @HttpCode(201)
    open(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("releaseId") releaseId: string,
    ) {
        return this.releases.open(ctx, siteId, releaseId);
    }
}
