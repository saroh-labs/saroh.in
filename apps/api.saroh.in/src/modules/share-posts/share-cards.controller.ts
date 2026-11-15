import {
    Controller,
    Get,
    Query,
    Res,
    StreamableFile,
    UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import type { ShareQuery } from "./public-share.service";
import { PublicShareService } from "./public-share.service";
import { SharePostsSwitchGuard } from "./share-posts-switch";

/**
 * The booking page's card with a headline typed in the share sheet
 * (#1375; owner, 12 Nov 2026). Signed in, in the business, with
 * `social:read`: the public picture never takes words from its address,
 * so nobody else can draw theirs in the business's look.
 *
 *   GET organizations/:organizationId/share/book/image
 *       ?headline=&style=&size=&bg=&fg=&w=
 */
@Controller("organizations/:organizationId/share")
@UseGuards(
    SharePostsSwitchGuard,
    BetterAuthGuard,
    OrganizationGuard,
    ModuleEnforcementGuard,
)
// Becomes SOCIAL when the Social module exists.
@RequireModule("WEBSITE")
export class ShareCardsController {
    constructor(private readonly share: PublicShareService) {}

    @Get("book/image")
    async book(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ShareQuery,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        authorize(ctx, "social:read");
        const bytes = await this.share.bookForOrganization(
            ctx.organizationId,
            query,
            `share-org:${ctx.userId}`,
        );
        // Words someone typed: never kept by anything in between.
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return new StreamableFile(bytes, {
            type: "image/png",
            length: bytes.length,
        });
    }
}
