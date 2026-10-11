import {
    Controller,
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
import type { MomentsSeen } from "./moments.service";
import { MomentsService } from "./moments.service";

/**
 * The moments a business has seen (wave G). Tenancy, not a module: a first
 * order and a first booking are each told once whichever modules are on.
 * The service authorizes both routes (`org:read`).
 */
@Controller("organizations/:organizationId/moments")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class MomentsController {
    constructor(private readonly moments: MomentsService) {}

    /** The moments already seen, by key. */
    @Get()
    read(@OrgContext() ctx: OrganizationContext): Promise<MomentsSeen> {
        return this.moments.read(ctx);
    }

    /** Put one away for the whole business. Twice keeps the first time. */
    @Post(":key/seen")
    @HttpCode(200)
    markSeen(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
    ): Promise<MomentsSeen> {
        return this.moments.markSeen(ctx, key);
    }
}
