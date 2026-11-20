import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { WebsiteAreaSwitchGuard } from "../sites/website-area-switch";
import {
    ApprovePostDto,
    AskPostChangesDto,
    CreatePostDto,
    PostApprovalRequestDto,
    SchedulePostDto,
    UpdatePostDto,
} from "./dto";
import { PostApprovalService } from "./post-approval.service";
import { PostRevisionsService } from "./post-revisions.service";
import { PostsService } from "./posts.service";

/**
 * A site's posts (ADR-004, #209). These used to hang off a store
 * (`/stores/:storeId/posts`), which meant a business with a website and no shop
 * could not write at all.
 *
 * Double-guarded like every other org-scoped surface: `BetterAuthGuard`
 * authenticates the session user and `OrganizationGuard` resolves an authorized
 * {@link OrganizationContext} from the `:organizationId` param. The service
 * enforces the site policy on top and proves the site belongs to the org.
 */
@Controller("organizations/:organizationId/sites/:siteId/posts")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class PostsController {
    constructor(
        private readonly posts: PostsService,
        private readonly revisions: PostRevisionsService,
        private readonly approval: PostApprovalService,
    ) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.posts.list(ctx, siteId);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CreatePostDto,
    ) {
        return this.posts.create(ctx, siteId, dto);
    }

    @Get(":postId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.get(ctx, siteId, postId);
    }

    @Put(":postId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Body() dto: UpdatePostDto,
    ) {
        return this.posts.update(ctx, siteId, postId, dto);
    }

    /** Put this post on the site (#232). Requires `section:write`. */
    @Post(":postId/publish")
    @HttpCode(200)
    publish(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.publish(ctx, siteId, postId);
    }

    /** Take it off the site, keeping its history. Requires `section:write`. */
    @Delete(":postId/publish")
    unpublish(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.unpublish(ctx, siteId, postId);
    }

    /** Publish post › Later (U17a): `{ at }`, an ISO instant. Moves an earlier one. */
    @Put(":postId/schedule")
    schedule(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Body() dto: SchedulePostDto,
    ) {
        return this.posts.schedule(ctx, siteId, postId, dto);
    }

    /** Don't publish it later after all. */
    @Delete(":postId/schedule")
    unschedule(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.unschedule(ctx, siteId, postId);
    }

    /**
     * Send for approval (O7): `{ note?, at? }`. `section:write`. Alerts
     * whoever may approve it.
     */
    @Post(":postId/approval-request")
    @UseGuards(WebsiteAreaSwitchGuard)
    @HttpCode(200)
    requestApproval(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Body() dto: PostApprovalRequestDto,
    ) {
        return this.approval.request(ctx, siteId, postId, dto);
    }

    /**
     * Approve the post (O7): `site:approve`, never its last editor (403).
     * Publishes it now, or on the day its writer picked.
     */
    @Post(":postId/approve")
    @UseGuards(WebsiteAreaSwitchGuard)
    @HttpCode(200)
    approve(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Body() dto: ApprovePostDto,
    ) {
        return this.approval.approve(ctx, siteId, postId, dto);
    }

    /** Ask for changes on the post, with a reason (UX-043). Same rules. */
    @Post(":postId/ask")
    @UseGuards(WebsiteAreaSwitchGuard)
    @HttpCode(200)
    askForChanges(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Body() dto: AskPostChangesDto,
    ) {
        return this.approval.askForChanges(ctx, siteId, postId, dto);
    }

    /** History (U17a): newest first, who and why, no bodies. */
    @Get(":postId/revisions")
    listRevisions(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.revisions.list(ctx, siteId, postId);
    }

    /** One revision in full, for Compare. */
    @Get(":postId/revisions/:revisionId")
    getRevision(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Param("revisionId") revisionId: string,
    ) {
        return this.revisions.get(ctx, siteId, postId, revisionId);
    }

    /** Make a revision the draft (the draft as it was is kept first). */
    @Post(":postId/revisions/:revisionId/restore")
    @HttpCode(200)
    restoreRevision(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
        @Param("revisionId") revisionId: string,
    ) {
        return this.revisions.restore(ctx, siteId, postId, revisionId);
    }

    @Delete(":postId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.remove(ctx, siteId, postId);
    }
}
