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
import { SharePostInputDto } from "./dto";
import { SharePostsSwitchGuard } from "./share-posts-switch";
import type { SharePostView } from "./share-posts.service";
import { SharePostsService } from "./share-posts.service";

/**
 * Create post's own posts (#1378): the business's own headline or photo,
 * saved for its share picture. The Social permissions in the service
 * (`social:read`, `social:post`); the module gate is Website for now.
 */
@Controller("organizations/:organizationId/share-posts")
@UseGuards(
    SharePostsSwitchGuard,
    BetterAuthGuard,
    OrganizationGuard,
    ModuleEnforcementGuard,
)
// Becomes SOCIAL when the Social module exists.
@RequireModule("WEBSITE")
export class SharePostsController {
    constructor(private readonly posts: SharePostsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext): Promise<SharePostView[]> {
        return this.posts.list(ctx);
    }

    @Get(":postId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<SharePostView> {
        return this.posts.get(ctx, id);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SharePostInputDto,
    ): Promise<SharePostView> {
        return this.posts.create(ctx, dto);
    }

    @Patch(":postId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
        @Body() dto: SharePostInputDto,
    ): Promise<SharePostView> {
        return this.posts.update(ctx, id, dto);
    }

    @Delete(":postId")
    @HttpCode(204)
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("postId") id: string,
    ): Promise<void> {
        return this.posts.remove(ctx, id);
    }
}
