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
    Query,
    UseGuards,
} from "@nestjs/common";

import { LifecycleWrite } from "../../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../../common/guards/organization.guard";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { PostInputDto, PostListQueryDto, PostTimeDto } from "./dto";
import type { PostView } from "./post-view";
import { SocialPostsService } from "./posts.service";

/**
 * Saroh Social's posts (U5). The permission, `MODULE_SOCIAL` and the plan
 * are asked in the service; never cached.
 *
 *   GET    …/social/posts?status=&from=&to=   list (scheduled | posted | failed | draft; a month by from/to)
 *   POST   …/social/posts                     new: { …post, action: draft | schedule | now, publishAt }
 *   POST   …/social/posts/request-more        Request more, once a month
 *   GET    …/social/posts/:id                 one post with each channel's result
 *   PATCH  …/social/posts/:id                 change, Move (publishAt), schedule, post now, back to draft
 *   POST   …/social/posts/:id/cancel          cancel one not started (it stops counting)
 *   POST   …/social/posts/:id/retry           try its failed channels again, now or { publishAt }
 *   GET    …/social/posts/:id/results         visits and paid from its link
 *   DELETE …/social/posts/:id                 delete, or Remove from Saroh once it went out
 */
@Controller("organizations/:organizationId/social/posts")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class SocialPostsController {
    constructor(private readonly posts: SocialPostsService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: PostListQueryDto,
    ): Promise<PostView[]> {
        return this.posts.list(ctx, query);
    }

    @Post()
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: PostInputDto,
    ): Promise<PostView> {
        return this.posts.create(ctx, dto);
    }

    @Post("request-more")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    requestMore(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<{ requested: true }> {
        return this.posts.requestMore(ctx);
    }

    @Get(":postId")
    @Header("Cache-Control", "no-store")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<PostView> {
        return this.posts.get(ctx, id);
    }

    @Patch(":postId")
    @Header("Cache-Control", "no-store")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
        @Body() dto: PostInputDto,
    ): Promise<PostView> {
        return this.posts.update(ctx, id, dto);
    }

    /** Stopping a post is never refused for a business that is closing. */
    @Post(":postId/cancel")
    @HttpCode(200)
    @LifecycleWrite("wind-down")
    @Header("Cache-Control", "no-store")
    cancel(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<PostView> {
        return this.posts.cancel(ctx, id);
    }

    @Post(":postId/retry")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    retry(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
        @Body() dto: PostTimeDto,
    ): Promise<PostView> {
        return this.posts.retry(ctx, id, dto.publishAt);
    }

    @Get(":postId/results")
    @Header("Cache-Control", "no-store")
    results(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<{
        visits: number;
        paid: number;
        from: string | null;
        to: string;
    }> {
        return this.posts.results(ctx, id);
    }

    @Delete(":postId")
    @HttpCode(204)
    @LifecycleWrite("wind-down")
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<void> {
        await this.posts.remove(ctx, id);
    }
}
