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
import { CreatePostDto, UpdatePostDto } from "./dto";
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
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class PostsController {
    constructor(private readonly posts: PostsService) {}

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

    @Delete(":postId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("postId") postId: string,
    ) {
        return this.posts.remove(ctx, siteId, postId);
    }
}
