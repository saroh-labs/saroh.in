import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsObject, IsString, MaxLength, MinLength } from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { SavedViewsService } from "./saved-views.service";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

class CreateSavedViewDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    resource!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    // Plain JSON URL-filter contract; never SQL.
    @IsObject()
    filters!: Record<string, unknown>;
}

/**
 * Saved list views (#124). Per-actor, per-resource named filters. Double-guarded;
 * every operation is Organization- and owner-scoped in the service.
 */
@Controller("organizations/:organizationId/saved-views")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class SavedViewsController {
    constructor(private readonly views: SavedViewsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("resource") resource: string,
    ) {
        return this.views.list(ctx, resource);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateSavedViewDto,
    ) {
        return this.views.create(ctx, dto);
    }

    @Delete(":id")
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("id") id: string,
    ) {
        await this.views.remove(ctx, id);
        return { ok: true };
    }
}
