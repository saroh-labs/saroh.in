import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
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
import { authorize } from "../organizations/organization-policy";
import { CreateStoreDto, UpdateStoreDto } from "./dto";
import { StoresService } from "./stores.service";

/**
 * Owner-scoped store endpoints. The owning user is always the authenticated
 * session user (resolved by BetterAuthGuard, read via @CurrentUser) — never
 * client-supplied — and the service enforces ownership on read/update.
 */
@Controller("stores")
@UseGuards(BetterAuthGuard)
export class StoresController {
    constructor(private readonly storesService: StoresService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.storesService.listForUser(user.id);
    }

    /**
     * Create a store under the ACTIVE organization. Org-scoped
     * (`OrganizationGuard` resolves + proves membership from the request
     * context, never the client body) and gated by `store:create`
     * (OWNER/ADMIN). Since B5 a store must belong to an Organization, so the
     * org id is required and taken from the proven context.
     */
    @Post()
    @HttpCode(201)
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    create(
        @CurrentUser() user: AuthUser,
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateStoreDto,
    ) {
        authorize(ctx, "store:create");
        return this.storesService.createForUser(
            user.id,
            ctx.organizationId,
            dto,
        );
    }

    @Get(":id")
    get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.storesService.getForUser(id, user.id);
    }

    @Put(":id")
    update(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Body() dto: UpdateStoreDto,
    ) {
        return this.storesService.updateForUser(user.id, id, dto);
    }
}
