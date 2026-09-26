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

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import {
    CollectionsService,
    readCollections,
    writeCollections,
} from "./collections.service";
import {
    CollectionProductsDto,
    CreateCollectionDto,
    ProductCollectionsDto,
    UpdateCollectionDto,
} from "./dto";

/**
 * The business's collections (#516). Org-nested, so the business comes from
 * the path the guard proved; reading needs `store:read`, changing needs
 * `store:write`. Products are added, ordered and removed only on a
 * hand-picked collection; an automatic one follows its category.
 */
@Controller("organizations/:organizationId/collections")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationCollectionsController {
    constructor(private readonly collections: CollectionsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.collections.list(readCollections(ctx));
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateCollectionDto,
    ) {
        return this.collections.create(writeCollections(ctx), dto);
    }

    @Get(":collectionId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
    ) {
        return this.collections.get(readCollections(ctx), collectionId);
    }

    @Patch(":collectionId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
        @Body() dto: UpdateCollectionDto,
    ) {
        return this.collections.update(
            writeCollections(ctx),
            collectionId,
            dto,
        );
    }

    @Delete(":collectionId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
    ) {
        return this.collections.remove(writeCollections(ctx), collectionId);
    }

    /** Add products to the end. */
    @Post(":collectionId/products")
    @HttpCode(200)
    addProducts(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
        @Body() dto: CollectionProductsDto,
    ) {
        return this.collections.addProducts(
            writeCollections(ctx),
            collectionId,
            dto.productIds,
        );
    }

    /** The whole list, in order. */
    @Put(":collectionId/products")
    setProducts(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
        @Body() dto: CollectionProductsDto,
    ) {
        return this.collections.setProducts(
            writeCollections(ctx),
            collectionId,
            dto.productIds,
        );
    }

    @Delete(":collectionId/products/:productId")
    removeProduct(
        @OrgContext() ctx: OrganizationContext,
        @Param("collectionId") collectionId: string,
        @Param("productId") productId: string,
    ) {
        return this.collections.removeProduct(
            writeCollections(ctx),
            collectionId,
            productId,
        );
    }
}

/**
 * One product's collections and the website pages that show it (#516), for
 * the product page's cards and its "Collections" sheet.
 */
@Controller("organizations/:organizationId/products/:productId/collections")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class ProductCollectionsController {
    constructor(private readonly collections: CollectionsService) {}

    @Get()
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
    ) {
        return this.collections.forProduct(readCollections(ctx), productId);
    }

    /** Exactly these hand-picked collections. */
    @Put()
    set(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: ProductCollectionsDto,
    ) {
        return this.collections.setForProduct(
            writeCollections(ctx),
            productId,
            dto,
        );
    }
}
