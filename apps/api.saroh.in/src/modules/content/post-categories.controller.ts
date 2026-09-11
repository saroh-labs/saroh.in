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
import { CreatePostCategoryDto, UpdatePostCategoryDto } from "./dto";
import { PostCategoriesService } from "./post-categories.service";

/** A site's post categories (ADR-004, #209). Guarded like its posts. */
@Controller("organizations/:organizationId/sites/:siteId/post-categories")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class PostCategoriesController {
    constructor(private readonly categories: PostCategoriesService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.categories.list(ctx, siteId);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CreatePostCategoryDto,
    ) {
        return this.categories.create(ctx, siteId, dto);
    }

    @Put(":categoryId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: UpdatePostCategoryDto,
    ) {
        return this.categories.update(ctx, siteId, categoryId, dto);
    }

    @Delete(":categoryId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("categoryId") categoryId: string,
    ) {
        return this.categories.remove(ctx, siteId, categoryId);
    }
}
