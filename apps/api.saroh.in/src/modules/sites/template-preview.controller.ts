import { Controller, Get, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { TemplatePreviewDetails } from "./template-preview";
import { templatePreviewDetails } from "./template-preview";

/**
 * The business's own details a template's preview is drawn with (DEC-216),
 * at `/organizations/:organizationId/template-preview`. Not gated on
 * Website: the Turn on sheet previews a template before Website is on.
 */
@Controller("organizations/:organizationId/template-preview")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class TemplatePreviewController {
    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<TemplatePreviewDetails> {
        return templatePreviewDetails(ctx);
    }
}
