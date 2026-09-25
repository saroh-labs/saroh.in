import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CatalogueAccess } from "../catalogue/catalogue-access";
import { CategoriesService } from "./categories.service";
import {
    CreateCategoryDto,
    MergeCategoryDto,
    RenameCategoryDto,
    RestoreCategoryDto,
    UpdateCategoryDto,
} from "./dto";

/**
 * The business's categories (#529). Org-nested, so the business comes from
 * the path the guard proved; reading needs `store:read`, changing needs
 * `store:write`.
 */
@Controller("organizations/:organizationId/catalogue/categories")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationCategoriesController {
    constructor(
        private readonly categories: CategoriesService,
        private readonly access: CatalogueAccess,
    ) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.categories.list(this.access.read(ctx).organizationId);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateCategoryDto,
    ) {
        return this.categories.create(this.access.write(ctx), dto);
    }

    @Put(":categoryId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("categoryId") categoryId: string,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.categories.update(this.access.write(ctx), categoryId, dto);
    }

    @Delete(":categoryId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("categoryId") categoryId: string,
    ) {
        return this.categories.remove(this.access.write(ctx), categoryId);
    }

    /** Undo of a merge or delete. */
    @Post("restore")
    @HttpCode(201)
    restore(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: RestoreCategoryDto,
    ) {
        return this.categories.restore(this.access.write(ctx), dto);
    }

    @Patch(":categoryId")
    rename(
        @OrgContext() ctx: OrganizationContext,
        @Param("categoryId") categoryId: string,
        @Body() dto: RenameCategoryDto,
    ) {
        return this.categories.rename(this.access.write(ctx), categoryId, dto);
    }

    @Post(":categoryId/merge")
    @HttpCode(200)
    merge(
        @OrgContext() ctx: OrganizationContext,
        @Param("categoryId") categoryId: string,
        @Body() dto: MergeCategoryDto,
    ) {
        return this.categories.merge(this.access.write(ctx), categoryId, dto);
    }
}

/**
 * The old per-storefront address, kept for one release (#529): the
 * storefront's business, under the storefront's own access rules, then the
 * same organization-scoped service.
 */
@Controller("stores/:storeId/categories")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class CategoriesController {
    constructor(
        private readonly categories: CategoriesService,
        private readonly access: CatalogueAccess,
    ) {}

    @Get()
    async list(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        const scope = await this.access.readViaStore(storeId, user.id);
        return this.categories.list(scope.organizationId);
    }

    @Post()
    @HttpCode(201)
    async create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateCategoryDto,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.create(org, dto);
    }

    @Put(":categoryId")
    async update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: UpdateCategoryDto,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.update(org, categoryId, dto);
    }

    @Delete(":categoryId")
    async remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.remove(org, categoryId);
    }

    /** Undo of a merge or delete. */
    @Post("restore")
    @HttpCode(201)
    async restore(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: RestoreCategoryDto,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.restore(org, dto);
    }

    @Patch(":categoryId")
    async rename(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: RenameCategoryDto,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.rename(org, categoryId, dto);
    }

    @Post(":categoryId/merge")
    @HttpCode(200)
    async merge(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: MergeCategoryDto,
    ) {
        const org = await this.access.writeViaStore(storeId, user.id);
        return this.categories.merge(org, categoryId, dto);
    }
}
