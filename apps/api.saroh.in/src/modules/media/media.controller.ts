import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CreateUploadDto } from "./dto";
import { MediaService } from "./media.service";

/**
 * Media endpoints for an Organization (S2-008), scoped to
 * `/organizations/:organizationId/media`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()` — never a raw client-supplied org — and the service enforces
 * the `media:read` / `media:write` policy on top.
 *
 * Upload is a two-step, direct-to-storage flow:
 *   1. POST `/upload-url` → server mints a presigned PUT + a PENDING row.
 *   2. client PUTs the bytes straight to storage using the returned url/headers.
 *   3. POST `/:mediaId/complete` → server confirms + flips the row to READY.
 */
@Controller("organizations/:organizationId/media")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class MediaController {
    constructor(private readonly media: MediaService) {}

    @Post("upload-url")
    @HttpCode(201)
    createUpload(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateUploadDto,
    ) {
        return this.media.createUpload(ctx, dto);
    }

    @Post(":mediaId/complete")
    completeUpload(
        @OrgContext() ctx: OrganizationContext,
        @Param("mediaId") mediaId: string,
    ) {
        return this.media.completeUpload(ctx, mediaId);
    }

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.media.list(ctx);
    }

    @Delete(":mediaId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("mediaId") mediaId: string,
    ) {
        return this.media.remove(ctx, mediaId);
    }
}
