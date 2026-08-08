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

import type { Form } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CreateFormDto, UpdateFormDto } from "./dto";
import { FormsService } from "./forms.service";

/**
 * Authorized enquiry-Form management for an Organization (S3-002), scoped to
 * `/organizations/:organizationId/forms`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces `form:read`/`form:write` on top. The
 * PUBLIC submission endpoint is deliberately NOT here — it lives in the guardless
 * {@link EnquiryController}.
 */
@Controller("organizations/:organizationId/forms")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class FormsController {
    constructor(private readonly forms: FormsService) {}

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateFormDto,
    ): Promise<Form> {
        return this.forms.create(ctx, dto);
    }

    @Get()
    list(@OrgContext() ctx: OrganizationContext): Promise<Form[]> {
        return this.forms.list(ctx);
    }

    @Get(":formId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("formId") formId: string,
    ): Promise<Form> {
        return this.forms.get(ctx, formId);
    }

    @Patch(":formId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("formId") formId: string,
        @Body() dto: UpdateFormDto,
    ): Promise<Form> {
        return this.forms.update(ctx, formId, dto);
    }

    @Delete(":formId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("formId") formId: string,
    ): Promise<{ id: string; deleted: true }> {
        return this.forms.remove(ctx, formId);
    }
}
